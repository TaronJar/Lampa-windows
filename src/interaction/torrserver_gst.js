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
    const icon = '<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="15" fill="none" stroke="white" stroke-width="2.4"/><path d="M8.5 10.1h12v2.8h-4.6v10.8h-2.8V12.9H8.5zM25.9 14.1c-1.1-.8-2.2-1.2-3.3-1.2-1 0-1.7.5-1.7 1.3 0 .7.5 1.1 2.2 1.6l1.3.4c2.4.8 3.7 2.2 3.7 4.3 0 2.7-2.1 4.5-5.1 4.5-1.9 0-3.6-.7-5-2l1.7-2c1 .9 2.1 1.4 3.3 1.4 1.3 0 2.1-.6 2.1-1.5 0-.8-.6-1.2-2.3-1.7l-1.4-.5c-2.3-.8-3.4-2-3.4-4.1 0-2.5 1.9-4.2 4.7-4.2 1.7 0 3.3.6 4.6 1.6z" fill="white"/><path d="M20.5 3.8 13.2 18h5.1l-3.1 14.2L24 18.4h-5.1z" fill="#171717"/><path d="m20.8 4.8-6.2 12.1h5.1l-3 12.1 6.2-12.1h-5.1z" fill="white"/></svg>'

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
        field: { name: 'Установить / обновить GST', description: 'Скачать GST-сборку с проверкой SHA-256' },
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
