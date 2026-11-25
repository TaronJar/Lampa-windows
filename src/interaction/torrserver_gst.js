import SettingsApi from './settings/api'
import Noty from './noty'

function init(){
    const bridge = window.torrserverGst
    if(!bridge || !Lampa.Platform.desktop()) return

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
        field: { name: 'Запустить сервер', description: 'Запуск управляемого экземпляра на 127.0.0.1:8090' },
        onChange: async () => {
            try {
                const status = await bridge.start()
                Noty.show(statusMessage(status), { time: 5000 })
            } catch (error) { showError(error) }
        }
    })
    SettingsApi.addParam({
        component,
        param: { name: 'gst_stop', type: 'button', default: '' },
        field: { name: 'Остановить сервер', description: 'Останавливает только процесс, запущенный менеджером' },
        onChange: async () => {
            try {
                const result = await bridge.stop()
                Noty.show(result.stopped ? 'TorrServer GST остановлен' : 'Не удалось подтвердить остановку процесса', { time: 5000 })
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
        onChange: () => {
            if (bridge.status) bridge.status().then(status => {
                if(status.running) window.open(status.url, '_blank')
                else Noty.show('Сначала запустите TorrServer GST', { time: 4000 })
            }).catch(showError)
        }
    })
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
import SettingsApi from './settings/api'
import Noty from './noty'

function init(){
    const bridge = window.torrserverGst
    if(!bridge || !Lampa.Platform.desktop()) return

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
        field: { name: 'Запустить сервер', description: 'Запуск управляемого экземпляра на 127.0.0.1:8090' },
        onChange: async () => {
            try {
                const status = await bridge.start()
                Noty.show(statusMessage(status), { time: 5000 })
            } catch (error) { showError(error) }
        }
    })
    SettingsApi.addParam({
        component,
        param: { name: 'gst_stop', type: 'button', default: '' },
        field: { name: 'Остановить сервер', description: 'Останавливает только процесс, запущенный менеджером' },
        onChange: async () => {
            try {
                const result = await bridge.stop()
                Noty.show(result.stopped ? 'TorrServer GST остановлен' : 'Не удалось подтвердить остановку процесса', { time: 5000 })
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
        onChange: () => {
            if (bridge.status) bridge.status().then(status => {
                if(status.running) window.open(status.url, '_blank')
                else Noty.show('Сначала запустите TorrServer GST', { time: 4000 })
            }).catch(showError)
        }
    })
}

function escapeHtml(value){\n    return String(value).replace(/[&<>\\\"']/g, character => ({\n        '&': '&amp;',\n        '<': '&lt;',\n        '>': '&gt;',\n        '\\"': '&quot;',\n        \"'\": '&#39;'\n    }[character]))\n}\n\nfunction statusMessage(status){
    return 'TorrServer GST: ' + (status.installed ? 'установлен' : 'не установлен') + ', ' + (status.running ? 'запущен' : 'остановлен') + '. URL: ' + status.url
}

function showError(error){
    const message = error && error.message ? error.message : String(error)
    Noty.show('Ошибка TorrServer GST: ' + escapeHtml(message), { time: 8000 })
}

export default { init }
