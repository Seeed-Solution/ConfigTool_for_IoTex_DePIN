// 'use strict'

import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer'
import { app, protocol, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
const { SerialPort } = require('serialport')
const Menu = require("electron-create-menu")
import i18next from 'i18next'
const { autoUpdater } = require("electron-updater")

import { formatLocale, bufferToHexWithSpace, delayMs } from './utils'
const path = require('path')
const fs = require('fs')
const fsPromises = fs.promises
const Store = require('electron-store')
const store = new Store()
const { Readable } = require('stream')
const { ReadlineParser } = require('@serialport/parser-readline')
const { once, EventEmitter } = require('events')


let appName = "Indicator IoTeX Configuration Tool"
app.name = appName

const logger = require("electron-log")
autoUpdater.logger = logger
const isDevelopment = process.env.NODE_ENV !== 'production'
autoUpdater.logger.transports.file.level = isDevelopment ? "debug" : "info"

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win
let winGeneral
let winGeneralStartTimer
let winSensor
let winSensorStartTimer
let sysLocale

let serialPorts = []
let selectedSerialPort
let serial


//stream
const stream = new Readable({
  read: (size) => {}
})
//parser
const parser = stream.pipe(new ReadlineParser())

//ASCII/Binary protocol
let ee = new EventEmitter()

//other global var
let menuContext = 'unknown'
let autoUpdateTimeHandler = null

/**
 * The Menu's locale only follows the system, the user selection from the GUI doesn't affect
 */
async function translateMenu() {
  sysLocale = formatLocale(store.get('selectedLocale') || process.env.LOCALE || app.getLocale())
  logger.info('the sys locale:', sysLocale)

  await i18next.init({
    lng: sysLocale,
    fallbackLng: 'en',
    debug: isDevelopment,
    resources: {
      zh: {
        translation: {
          "File": "文件",
          "Edit": "编辑",
          "Speech": "语音",
          "View": "视图",
          "Window": "窗口",
          "Help": "帮助",
          "About": "关于",
          "Hide": "隐藏",
          "Quit": "退出",
          "Report an issue": "报告错误",
        } //other keywords are translated by the OS automatically
      }
    }
  }).then((t) => {
    Menu((defaultMenu, separator) => {
      defaultMenu[0].submenu[0].label = t('About') + " " + appName
      defaultMenu[0].submenu[4].label = t('Hide') + " " + appName
      defaultMenu[0].submenu[8].label = t('Quit') + " " + appName
      if (!isDevelopment) defaultMenu[3].submenu[2].showOn = 'neverMatch'
      defaultMenu[4].label = t('Window')
      defaultMenu[5].label = t('Help')
      defaultMenu[5].showOn = ['darwin', 'win32', 'linux']
      defaultMenu[5].submenu.push({
        label: t('Report an issue'),
        click: () => {
          shell.openExternal('https://github.com/Seeed-Solution/ConfigTool_for_IoTex_DePIN/issues')
        }
      })
      logger.debug(JSON.stringify(defaultMenu))
      return defaultMenu
    },
    // This function is used to translate the default labels
    t
  )})
}

if (process.platform === 'darwin') {
  app.setAboutPanelOptions({
    applicationName: appName,
  })
}

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([{scheme: 'app', privileges: { secure: true, standard: true } }])

function createMainWindow () {
  // Create the browser window.
  let w = 512
  let h = 320

  if (process.platform === 'win32') {
    h += 30  //for menu bar
  }

  win = new BrowserWindow({
    show: false,
    width: w,
    height: h,
    minWidth: w,
    minHeight: h,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION,
      enableRemoteModule: true
    }
  })

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    win.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
    if (!process.env.IS_TEST) win.webContents.openDevTools()
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    win.loadURL('app://./index.html')
  }

  win.on('closed', () => {
    win = null
  })

  win.once('ready-to-show', () => {
    win.show()
  })
}


// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  // if (process.platform !== 'darwin') {
    serialClose()
    app.quit()
  // }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createMainWindow()
  }
})

app.on('before-quit', () => {
  if (autoUpdateTimeHandler) clearTimeout(autoUpdateTimeHandler)
  serialClose()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {

  await translateMenu()

  if (isDevelopment && !process.env.IS_TEST) {
    let name = await installExtension(VUEJS_DEVTOOLS)
    logger.debug(`Added Extension:  ${name}`)
    logger.debug(`process.env.WEBPACK_DEV_SERVER_URL: ${process.env.WEBPACK_DEV_SERVER_URL}`)
  }

  createMainWindow()

  autoUpdateTimeHandler = setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify()
    autoUpdateTimeHandler = null
  }, 10000)
})

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', data => {
      if (data === 'graceful-exit') {
        serialClose()
        ipcMain.removeAllListeners()
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      serialClose()
      ipcMain.removeAllListeners()
      app.quit()
    })
  }
}

// Serial
ipcMain.on('init-serial-req', (event, arg) => {
  logger.info('init-serial-req ...')

  SerialPort.list().then(ports => {
    serialPorts = ports
    logger.debug(ports)

    let opened = false
    if (serial && serial.isOpen) opened = true

    let resp = {
      ports: ports,
      selectedPort: selectedSerialPort,
      opened: opened
    }

    event.reply('init-serial-resp', resp)
  })
})

function serialOpen(event) {
  serial = new SerialPort({
    path: selectedSerialPort,
    baudRate: 115200,
    autoOpen: false
  })

  let h = setTimeout(() => {
    event.reply('serial-open-resp', {opened: false, reason: 'timeout'})
  }, 5000)

  serial.on('open', () => {
    clearTimeout(h)
    event.reply('serial-open-resp', {opened: true, reason: ''})
  })

  serial.on('data', (data) => {
    stream.push(data)
  })

  serial.on('error', (err) => {
    logger.warn('serial error:', err)
  })

  serial.open()
}

function serialClose(cb) {
  if (serial) {
    serial.close((err) => {
      serial = null
      if (cb) cb()
    })
  }
}

ipcMain.on('serial-open-req', (event, selPort, ) => {
  logger.info('serial-open-req ...', selPort)

  if (serial && serial.isOpen) {
    if (selPort === selectedSerialPort) {
      logger.info('already opened')
      event.reply('serial-open-resp', {opened: true, reason: 'already opened'})
      return
    } else {
      logger.warn('request to open another port, rather', selectedSerialPort)
      selectedSerialPort = selPort
      serialClose(() => {
        serialOpen(event)
      })
    }
  } else {
    selectedSerialPort = selPort
    serialOpen(event)
  }
})

ipcMain.on('serial-close-req', (event, arg) => {
  logger.info('serial-close-req ...')

  if (!serial || !serial.isOpen) {
    logger.info('already closed')
    event.reply('serial-close-resp', {closed: true, reason: 'already closed'})
    return
  }

  let h = setTimeout(() => {
    event.reply('serial-close-resp', {closed: false, reason: 'timeout'})
  }, 1000)

  serialClose(() => {
    clearTimeout(h)
    menuContext = 'unknown'
    event.reply('serial-close-resp', {closed: true, reason: ''})
  })
})

// ASCII Protocol
function parseLine(line) {
  logger.debug(`parseLine: ${line}`)

  let found
  found  = line.match(/CMD_RESP:OK,\s?(.*)/)
  if (found) {
    logger.debug('RESP:OK,', found[1])
    let msg = {ret:'OK', data:found[1]}
    ee.emit('cmd-resp', msg)
    return
  }
  found = line.match(/CMD_RESP:ERR,\s?(.*)/)
  if (found) {
    logger.debug('RESP:ERR,', found[1])
    let msg = {ret:'ERR', data:found[1]}
    ee.emit('cmd-resp', msg)
    return
  }

  found  = line.match(/CMD_RESP:OK/)
  if (found) {
    logger.debug('RESP:OK,')
    let msg = {ret:'OK', data:''}
    ee.emit('cmd-resp', msg)
    return
  }
}


parser.on('data', (line) => {
  parseLine(line)
})


async function serialWriteAsync(data, timeout=250) {
  return new Promise((resolve, reject) => {
    const h = setTimeout(() => {
      reject(new Error('serialWriteAsync timeout'))
    }, timeout)
    if (serial && serial.isOpen) {
      serial.write(data, (error) => {
        if (error) {
          clearTimeout(h)
          reject(error)
        }
        serial.drain((error2) => {
          clearTimeout(h)
          if (error2) reject(error2)
          resolve()
        })
      })
    } else {
      reject(new Error('serial is not open'))
    }
  })
}

async function CmdAsync(strCmd, timeoutMs=3000) {
  for (let i = 0; i < 3 && (serial && serial.isOpen); i++) {

    await serialWriteAsync(strCmd)

    let h = setTimeout(() => {
      ee.emit('cmd-resp', {ret:'ERR', data:'Resp Timeout'})
      // throw new Error(`Recv timeout`)
    }, timeoutMs)

    try {
      const [Resp] = await once(ee, 'cmd-resp')
      clearTimeout(h)
      return Resp
    } catch (error) {
      clearTimeout(h)
      throw error
    }
  }
  throw new Error(`failed after multiple retries`)
}

// Device Info Query
ipcMain.on('dev-info-req', async (event) => {
  logger.info('dev-info-req ...')
  try {
    let mac
    let wallet
    let sn
    let msg 
    try {
      msg = await CmdAsync("Read_Device_Info\r\n", 3000)
      if( msg.ret == 'OK') {
          let found = msg.data.match(/\s?(.*),\s?(.*),\s?(.*)/)
          if( found ) {
            mac = found[1]
            sn = found[2]
            wallet=found[3]
          }
      } else {
        event.reply('dev-info-resp-error', msg.data)
      }
    } catch (error) {
      event.reply(`dev-info-resp-error:`, error)
    }

    let deviceInfoObj = {'MAC': mac, 'SN':sn, 'Wallet':wallet}
    logger.debug('deviceInfoObj:', deviceInfoObj)
    event.reply('dev-info-resp', deviceInfoObj)

  } catch (error) {
    logger.warn('error when querying device info:', error)
    event.reply('dev-info-resp-error', error)
  }
})

ipcMain.on('dev-info-write', async (event, msg) => {
  logger.info('dev-info-write...')
  try {

    //write
    logger.debug('device info:',msg)
    let cmd = "Device_PIN" + ' -s '+msg.SN  + ' -w ' + msg.Wallet +'\r\n'
    logger.debug('send cmd:', cmd)
    try {
      let resp = await CmdAsync(cmd, 3000)
      if( resp.ret == 'ERR' ) {
        event.reply('dev-info-write-ack-error', resp.data)
        return 
      }
    } catch (error) {
      event.reply('dev-info-write-ack-error', error)
      return 
    }

    event.reply('dev-info-write-ack')
  } catch (error) {
    logger.warn('error when write device info:', error)
    event.reply('dev-info-write-ack-error', error)
  }
})



// App self update, AutoUpdater
autoUpdater.on('update-available', (info) => {
  logger.info('update-available', JSON.stringify(info))
  let {version} = info
  if (win && version) win.webContents.send('update-available', version)
})

autoUpdater.on('update-not-available', (info) => {
  logger.info('update-not-available', JSON.stringify(info))
})

ipcMain.on('current-version-req', (event, arg) => {
  logger.info('current-version-req ...')
  let currentVersion = autoUpdater.currentVersion.version
  logger.info(`the current version is: ${currentVersion}`)
  event.reply('current-version-resp', {currentVersion: currentVersion})
})


// locale
ipcMain.on('locale-req', (event) => {
  logger.info('locale-req ...')
  event.reply('locale-resp', sysLocale)
})

ipcMain.on('locale-change', (event, arg) => {
  logger.info('locale-change, ', arg)
  if (arg === sysLocale) return
  i18next.changeLanguage(arg)
  translateMenu()
})

// System Call
ipcMain.on('goto-new-version', (event) => {
  shell.openExternal('https://github.com/Seeed-Solution/ConfigTool_for_IoTex_DePIN/releases/latest')
})