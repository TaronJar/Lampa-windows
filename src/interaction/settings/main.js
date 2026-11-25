import Template from '../../interaction/template'
import Controller from '../../core/controller'
import Scroll from '../../interaction/scroll'
import Api from './api'

function Main(){
    let comp
    let scrl = new Scroll({mask:true,over:true,step:200})
    let last

    /**
     * Создать
     */
    this.create = ()=>{
        comp = Template.get('settings_main')

        if(!window.lampa_settings.account_use) comp.find('[data-component="account"]').remove()
        if(!window.lampa_settings.plugins_use) comp.find('[data-component="plugins"]').remove()
        if(!Lampa.Platform.is('apple_tv')) comp.find('[data-component="appletv"]').remove()

        if(!window.lampa_settings.torrents_use){
            comp.find('[data-component="parser"]').remove()
            comp.find('[data-component="server"]').remove()
        }

        scrl.render().css('max-height', window.innerWidth <= 480 ? window.innerHeight * 0.6 : 'unset')
        scrl.append(comp)
        scrl.addSwipeDown(this.swipeAction)

        this.update()
    }

    /**
     * Обновить события
     */
    this.update = ()=>{
        // Fallback registration ensures FFmpeg's menu folder is visible even if init fails.
        if(!Api.getComponent('ffmpeg_manager')){
            Api.addComponent({
                component: 'ffmpeg_manager',
                name: 'FFmpeg',
                icon: '<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="15" fill="none" stroke="white" stroke-width="2"/><path d="M20 5 11 19h7l-3 12 10-16h-7z" fill="white"/></svg>'
            })
        }
        let components = Api.allComponents()

        for(let name in components){
            let aded = components[name]

            if(!comp.find('[data-component="'+name+'"]').length){
                let item = $(`<div class="settings-folder selector" data-component="${name}">
                    <div class="settings-folder__icon">
                        ${aded.icon}
                    </div>
                    <div class="settings-folder__name">${aded.name}</div>
                </div>`)

                if(aded.before && comp.find('[data-component="'+aded.before+'"]').length) comp.find('[data-component="'+aded.before+'"]').before(item)
                else if(aded.after && comp.find('[data-component="'+aded.after+'"]').length) comp.find('[data-component="'+aded.after+'"]').after(item)
                else comp.append(item)
            }
        }

        comp.find('.selector').unbind('hover:focus').on('hover:focus',(event)=>{
            last = event.target

            scrl.update($(event.target),true)
        }).unbind('hover:hover hover:touch').on('hover:hover hover:touch',(event)=>{
            last = event.target

            Navigator.focused(event.target)
        }).not('[data-static]').unbind('hover:enter').on('hover:enter',(event)=>{
            this.render().detach()

            this.onCreate($(event.target).data('component'))
        })
    }

    /**
     * Сделать активным
     */
    this.active = function(){
        Controller.collectionSet(comp)
        Controller.collectionFocus(last,comp)

        scrl.height($('.settings__head'))
    }

    /**
     * Рендер
     * @returns {object}
     */
    this.render = ()=>{
        return scrl.render()
    }
}

export default Main
