import SettingsApi from './settings/api'
import Storage from '../core/storage/storage'
import Noty from './noty'
import Settings from './settings/settings'

function init(){
    const bridge = window.torrserverGst
    if(!bridge) return

    // GST auto-connects on app startup when installed, unless the user has
    // explicitly switched back to the regular TorrServer from this manager.
    autoConnectGst(bridge)

    const component = 'torrserver_gst'
    const icon = '<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="30" height="30" rx="5" fill="none" stroke="white" stroke-width="2.5"/><path d="M11 10h14v3H11zm0 6h14v3H11zm0 6h8v3h-8z" fill="white"/></svg>'

    SettingsApi.addComponent({ component, icon, name: 'TorrServer GST' })

    SettingsApi.addParam({
        component,
        param: { name: 'gst_status', type: 'button', default: '' },
        field: { name: 'Статус TorrServer GST', description: 'Установка, состояние и адрес локального сервера' },
        onChange: async () => {
            try {
                const status = await bridge.status()
                Noty.show(statusMessage(status), { time: 6000 })
            } catch (error) { showError(error) }
        }
    })

    SettingsApi.addParam({
        component,
        param: { name: 'gst_install', type: 'button', default: '' },
        field: { name: 'Установить / обновить GST', description: 'Скачать Windows x64 GST-сборку с проверкой SHA-256' },
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
        param: { name: 'gst_toggle', type: 'button', default: '' },
        field: { name: 'Переключить GST / обычный TorrServer', description: 'Запускает GST и подключает его в Lampa либо останавливает GST и возвращает прежний сервер' },
        onChange: async () => {
            try {
                const current = await bridge.status()
                if(current.running){
                    const result = await bridge.stop()
                    if(result.stopped){
                        Storage.set(GST_AUTOSTART_KEY, false)
                        await bridge.setAutostart(false)
                        restorePreviousLink()
                        Settings.create('server')
                        Noty.show('GST остановлен. Восстановлена прежняя ссылка TorrServer.', { time: 6000 })
                    } else {
                        Noty.show('Не удалось подтвердить остановку GST', { time: 5000 })
                    }
                } else {
                    const status = await bridge.start()
                    if(status.running){
                        Storage.set(GST_AUTOSTART_KEY, true)
                        await bridge.setAutostart(true)
                        connectGstLink(status.url)
                                }
                    Noty.show(statusMessage(status), { time: 6000 })
                }
            } catch (error) { showError(error) }
        }
    })
}

const GST_BACKUP_KEY = 'torrserver_gst_previous_link'
const GST_AUTOSTART_KEY = 'torrserver_gst_autostart'

async function autoConnectGst(bridge){
    try {
        const enabled = Storage.get(GST_AUTOSTART_KEY, true)
        // Renderer storage is the user's actual preference. Sync it to Electron
        // main-process persistence so startup and UI cannot disagree.
        await bridge.setAutostart(enabled)

        const initial = await bridge.status()
        if(!initial.installed) {
            restorePreviousLink()
            return
        }

        if(!enabled) {
            // Main process may have started GST before renderer storage was read.
            // If the user opted out, stop it and restore the regular server.
            if(initial.running) await bridge.stop()
            restorePreviousLink()
            return
        }

        const status = initial.running ? initial : await bridge.start()
        if(status.running) connectGstLink(status.url)
    } catch (error) {
        // Auto-start is best-effort; leave the regular app usable if GST
        // cannot start (for example, when another process owns the port).
        restorePreviousLink()
        showError(error)
    }
}

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

    if(Storage.get(backup.key, '') === (backup.gstUrl || 'http://127.0.0.1:8090')){
        Storage.set(backup.key, backup.value)
    }
    if(typeof backup.gstEnabled !== 'undefined') Storage.set('torrserver_gts', backup.gstEnabled)
    Storage.erase(GST_BACKUP_KEY)
}

function statusMessage(status){
    return 'TorrServer GST: ' + (status.installed ? 'установлен' : 'не установлен') + ', ' + (status.running ? 'запущен' : 'остановлен') + '. URL: ' + status.url
}

function showError(error){
    const message = error && error.message ? error.message : String(error)
    Noty.show('Ошибка TorrServer GST: ' + message, { time: 8000 })
}

export default { init }
