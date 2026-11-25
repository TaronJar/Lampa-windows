import SettingsApi from './settings/api'
import Storage from '../core/storage/storage'
import Noty from './noty'

function init(){
    const bridge = window.torrserverGst
    if(!bridge) return

    // Recover the previous TorrServer URL if the app closed while GST was running.
    bridge.status().then(status => {
        if(!status.running) restorePreviousLink()
    }).catch(()=>{})

    const component = 'torrserver_gst'
    const icon = '<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="30" height="30" rx="5" fill="none" stroke="white" stroke-width="2.5"/><path d="M11 10h14v3H11zm0 6h14v3H11zm0 6h8v3h-8z" fill="white"/></svg>'

    SettingsApi.addComponent({ component, icon, name: 'TorrServer GST (Windows)' })
    SettingsApi.addParam({
        component,
        param: { name: 'gst_status', type: 'button', default: '' },
        field: { name: 'Обновить статус', description: 'Проверить установку, процесс и локальный сервер' },
        onChange: async () => {
            try {
                const status = await bridge.status()
                Noty.show(statusMessage(status), { time: 5000 })
            } catch (error) { showError(error) }
        }
    })
    SettingsApi.addParam({
        component,
        param: { name: 'gst_install', type: 'button', default: '' },
        field: { name: 'Установить / обновить GST', description: 'Скачать последнюю Windows x64 GST-сборку с проверкой SHA-256' },
        onChange: async () => {
            try {
                Noty.show('Проверяю релиз и загружаю TorrServer GST…', { time: 4000 })
                const result = await bridge.installLatest()
                Noty.show('Установлено: ' + result.version, { time: 6000 })
            } catch (error) { showError(error) }
        }
    })
    SettingsApi.addParam({
        component,
        param: { name: 'gst_start', type: 'button', default: '' },
        field: { name: 'Запустить и подключить GST', description: 'Запускает GST и автоматически переключает активную ссылку Lampa на локальный сервер' },
        onChange: async () => {
            try {
                const status = await bridge.start()
                if(status.running) connectGstLink(status.url)
                Noty.show(statusMessage(status), { time: 5000 })
            } catch (error) { showError(error) }
        }
    })
    SettingsApi.addParam({
        component,
        param: { name: 'gst_stop', type: 'button', default: '' },
        field: { name: 'Остановить и вернуть прежний сервер', description: 'Останавливает GST и возвращает прежнюю активную ссылку TorrServer' },
        onChange: async () => {
            try {
                const result = await bridge.stop()
                if(result.stopped) restorePreviousLink()
                Noty.show(result.stopped ? 'TorrServer GST остановлен, прежняя ссылка восстановлена' : 'Не удалось подтвердить остановку процесса', { time: 5000 })
            } catch (error) { showError(error) }
        }
    })
    SettingsApi.addParam({
        component,
        param: { name: 'gst_latest', type: 'button', default: '' },
        field: { name: 'Проверить последнюю версию', description: 'Узнать доступную версию без установки' },
        onChange: async () => {
            try {
                const release = await bridge.latest()
                Noty.show('Последний релиз: ' + escapeHtml(release.tag) + ' (' + escapeHtml(release.assetName) + ')', { time: 6000 })
            } catch (error) { showError(error) }
        }
    })
    SettingsApi.addParam({
        component,
        param: { name: 'gst_open_local', type: 'button', default: '' },
        field: { name: 'Открыть локальный TorrServer', description: 'Открывает интерфейс сервера в браузере по адресу http://127.0.0.1:8090' },
        onChange: async () => {
            try {
                const status = await bridge.status()
                if(status.running) window.open(status.url, '_blank')
                else Noty.show('Сначала запустите TorrServer GST', { time: 4000 })
            } catch (error) { showError(error) }
        }
    })
}

const GST_BACKUP_KEY = 'torrserver_gst_previous_link'

function activeLinkKey(){
    return Storage.get('torrserver_use_link', 'one') === 'two' ? 'torrserver_url_two' : 'torrserver_url'
}

function connectGstLink(url){
    let backup = Storage.get(GST_BACKUP_KEY, null)
    const key = activeLinkKey()
    const current = Storage.get(key, '')

    if(!backup){
        backup = { key, value: current, gstUrl: url, gstEnabled: Storage.get('torrserver_gts', false) }
    }
    backup.gstUrl = url
    Storage.set(GST_BACKUP_KEY, backup)

    Storage.set(key, url)
    Storage.set('torrserver_gts', true)
}

function restorePreviousLink(){
    const backup = Storage.get(GST_BACKUP_KEY, null)
    if(!backup || !backup.key || typeof backup.value === 'undefined') return

    // Restore only if the user hasn't changed the active URL since GST was connected.
    if(Storage.get(backup.key, '') === (backup.gstUrl || 'http://127.0.0.1:8090')){
        Storage.set(backup.key, backup.value)
    }
    if(typeof backup.gstEnabled !== 'undefined') Storage.set('torrserver_gts', backup.gstEnabled)
    Storage.erase(GST_BACKUP_KEY)
}

function escapeHtml(value){
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[character]))
}

function statusMessage(status){
    return 'TorrServer GST: ' + (status.installed ? 'установлен' : 'не установлен') + ', ' + (status.running ? 'запущен' : 'остановлен') + '. URL: ' + status.url
}

function showError(error){
    const message = error && error.message ? error.message : String(error)
    Noty.show('Ошибка TorrServer GST: ' + escapeHtml(message), { time: 8000 })
}

export default { init }
