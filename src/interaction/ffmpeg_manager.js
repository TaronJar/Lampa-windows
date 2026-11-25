import SettingsApi from './settings/api'
import Noty from './noty'

function init(){
    const bridge = window.lampaFfmpegPreview
    if(!bridge || typeof bridge.status !== 'function') return

    const component = 'ffmpeg_manager'
    const icon = '<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="15" fill="none" stroke="white" stroke-width="2"/><path d="M20 5 11 19h7l-3 12 10-16h-7z" fill="white"/></svg>'
    SettingsApi.addComponent({ component, icon, name: 'FFmpeg' })

    SettingsApi.addParam({
        component,
        param: { name: 'ffmpeg_status', type: 'button', default: '' },
        field: { name: 'Проверить FFmpeg / FFprobe', description: 'Проверка установки и версии обоих компонентов' },
        onChange: async () => {
            try { Noty.show(await statusText(bridge), { time: 8000 }) }
            catch(error) { showError(error) }
        }
    })

    SettingsApi.addParam({
        component,
        param: { name: 'ffmpeg_install', type: 'button', default: '' },
        field: { name: 'Установить / переустановить FFmpeg', description: 'Загрузка LGPL-сборки, распаковка и проверка ffmpeg.exe и ffprobe.exe' },
        onChange: async () => {
            try {
                Noty.show('Загружаю FFmpeg. Это может занять несколько минут…', { time: 6000 })
                const result = await bridge.install()
                Noty.show('FFmpeg установлен и проверен: ' + (result.version || 'версия доступна'), { time: 8000 })
            } catch(error) { showError(error) }
        }
    })
}

async function statusText(bridge){
    const status = await bridge.status()
    return 'FFmpeg: ' + (status.ffmpeg ? 'найден' : 'отсутствует') + '\\nFFprobe: ' + (status.ffprobe ? 'найден' : 'отсутствует') + '\\nВерсия: ' + (status.version || 'не установлена')
}

function showError(error){
    Noty.show('Ошибка FFmpeg: ' + (error && error.message ? error.message : String(error)), { time: 9000 })
}

export default { init }
