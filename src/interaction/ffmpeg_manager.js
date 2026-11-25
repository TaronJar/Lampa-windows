import SettingsApi from './settings/api'
import Noty from './noty'

function init(){
    const component = 'ffmpeg_manager'
    const icon = '<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="15" fill="none" stroke="white" stroke-width="2"/><path d="M20 5 11 19h7l-3 12 10-16h-7z" fill="white"/></svg>'
    // Register the settings section even if the Electron preload bridge is unavailable.
    SettingsApi.addComponent({ component, icon, name: 'FFmpeg', after: 'torrserver_gst' })

    SettingsApi.addParam({
        component,
        param: { name: 'ffmpeg_status', type: 'button', default: '' },
        field: { name: 'Проверить FFmpeg / FFprobe', description: 'Проверка установки и версии обоих компонентов' },
        onChange: async () => {
            const bridge = window.lampaFfmpegPreview
            if(!bridge || typeof bridge.status !== 'function'){
                showError('Модуль Electron preload недоступен')
                return
            }
            try { Noty.show(await statusText(bridge), { time: 8000 }) }
            catch(error) { showError(error) }
        }
    })

    SettingsApi.addParam({
        component,
        param: { name: 'ffmpeg_install', type: 'button', default: '' },
        field: { name: 'Установить / переустановить FFmpeg', description: 'Загрузка LGPL-сборки, распаковка и проверка ffmpeg.exe и ffprobe.exe' },
        onChange: async () => {
            const bridge = window.lampaFfmpegPreview
            if(!bridge || typeof bridge.install !== 'function'){
                showError('Модуль Electron preload недоступен')
                return
            }
            try {
                const removeProgress = bridge.onProgress ? bridge.onProgress(updateInstallProgress) : () => {}
                showInstallProgress('Подготовка установки FFmpeg', null)
                try {
                    const result = await bridge.install()
                    showInstallProgress('Установка завершена', 100)
                    setTimeoutCloseProgress()
                    Noty.show('FFmpeg установлен и проверен: ' + (result.version || 'версия доступна'), { time: 8000 })
                } finally { removeProgress() }
            } catch(error) { showError(error) }
        }
    })
}

async function statusText(bridge){
    const status = await bridge.status()
    return 'FFmpeg: ' + (status.ffmpeg ? 'найден' : 'отсутствует') + '\\nFFprobe: ' + (status.ffprobe ? 'найден' : 'отсутствует') + '\\nВерсия: ' + (status.version || 'не установлена')
}

function showInstallProgress(message, percent){
    let panel = document.getElementById('lampa-ffmpeg-install-progress')
    if(!panel){
        panel = document.createElement('div')
        panel.id = 'lampa-ffmpeg-install-progress'
        panel.style.cssText = 'position:fixed;z-index:99999;left:50%;top:24px;transform:translateX(-50%);width:min(440px,90vw);padding:18px 20px;background:#222;color:#fff;border-radius:12px;box-shadow:0 8px 28px #0008;font:14px sans-serif'
        panel.innerHTML = '<div id="lampa-ffmpeg-progress-label" style="margin-bottom:10px"></div><div style="height:8px;background:#444;border-radius:6px;overflow:hidden"><div id="lampa-ffmpeg-progress-fill" style="height:100%;width:0;background:#6abf69;transition:width .25s"></div></div><div id="lampa-ffmpeg-progress-percent" style="margin-top:8px;color:#bbb"></div>'
        document.body.appendChild(panel)
    }
    const label = panel.querySelector('#lampa-ffmpeg-progress-label')
    const fill = panel.querySelector('#lampa-ffmpeg-progress-fill')
    const pct = panel.querySelector('#lampa-ffmpeg-progress-percent')
    if(label) label.textContent = message
    if(fill) fill.style.width = percent === null ? '35%' : Math.max(0,Math.min(100,percent)) + '%'
    if(pct) pct.textContent = percent === null ? 'Выполняется…' : percent + '%'
}
function updateInstallProgress(event){
    const stages = { metadata:'Получение релиза', download:'Скачивание FFmpeg', verify:'Проверка SHA-256', extract:'Распаковка архива', validate:event.detail || 'Проверка бинарника', install:'Установка файлов', complete:'Завершено' }
    const label = event.phase === 'validate' ? event.detail : stages[event.phase] || event.detail || 'Установка FFmpeg'
    showInstallProgress(label, event.phase === 'download' ? event.percent : event.phase === 'complete' ? 100 : null)
}
function setTimeoutCloseProgress(){
    const panel = document.getElementById('lampa-ffmpeg-install-progress')
    if(panel) setTimeout(() => panel.remove(), 1600)
}
function showError(error){
    Noty.show('Ошибка FFmpeg: ' + (error && error.message ? error.message : String(error)), { time: 9000 })
}

export default { init }
