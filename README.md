# Lampa Windows

Windows-версия [Lampa](https://github.com/otterrr/lampa) на Electron с интеграцией локального **TorrServer GST**.

Проект объединяет интерфейс Lampa и Windows-оболочку Electron. Встроенный менеджер TorrServer GST позволяет устанавливать, запускать, останавливать и обновлять GST-сборку прямо из настроек приложения.

## Возможности

- **Lampa в Windows** — запуск приложения в отдельном Electron-окне.
- **TorrServer GST Manager** — управление локальной GST-сборкой TorrServer из настроек Lampa.
- **Установка и обновление GST** — загрузка подходящего Windows x64 релиза с проверкой SHA-256.
- **Автозапуск и подключение** — при включённом режиме GST автоматически запускается и подключается к Lampa.
- **Переключение серверов** — можно переключиться между управляемым GST и обычным TorrServer; исходная ссылка сервера сохраняется и восстанавливается.
- **Проверка статуса** — отображение установки, состояния сервера и локального адреса.
- **Локальная работа** — управляемый TorrServer GST использует адрес `127.0.0.1:8090`.

## TorrServer GST

Менеджер поддерживает Windows x64. GST-сборка скачивается из релизов проекта TorrServer:

- [TorrServer Releases](https://github.com/YouROK/TorrServer/releases)

Загруженный файл проверяется по SHA-256 перед заменой установленной версии. При обновлении текущий сервер корректно останавливается и, если он был запущен, запускается снова после завершения операции.

## Запуск из исходников

### Требования

- Windows x64
- [Node.js](https://nodejs.org/) и npm
- Git

### Установка зависимостей

```bash
git clone https://github.com/TaronJar/Lampa-windows.git
cd Lampa-windows
npm install
```

### Запуск Electron-версии

```bash
npm run electron:dev
```

### Запуск веб-версии в режиме разработки

```bash
npm start
```

### Другие команды

| Команда | Назначение |
| --- | --- |
| `npm run electron:compile` | Компиляция Electron TypeScript-кода |
| `npm run electron:dev` | Компиляция и запуск Electron |
| `npm start` | Запуск dev-сборки через Gulp |
| `npm run debug` | Запуск режима отладки |
| `npm test` | Запуск тестов Vitest |
| `npm run doc` | Генерация документации |

## Управление TorrServer GST

В настройках Lampa находится раздел **TorrServer GST**, где доступны:

- просмотр статуса установки и работы сервера;
- установка или обновление GST;
- запуск и остановка GST с переключением адреса TorrServer в Lampa.

Если GST установлен и автозапуск включён, приложение пытается запустить его при старте. Если запуск не удался, Lampa возвращается к ранее настроенному адресу обычного TorrServer.

## Используемые технологии

- [Lampa](https://github.com/otterrr/lampa)
- [Electron](https://www.electronjs.org/)
- [TorrServer GST](https://github.com/YouROK/TorrServer)
- Node.js
- TypeScript
- Gulp

## Примечание

Это проект для Windows. Управляемая установка и запуск TorrServer GST рассчитаны на Windows x64. Для обычного TorrServer можно использовать собственный ранее настроенный адрес в параметрах Lampa.

---

