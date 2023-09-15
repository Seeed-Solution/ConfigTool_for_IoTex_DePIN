<i18n>
{
  "en": {
    "Maximum 32 chars allowed": "Maximum 32 non-whitespace chars",
    "text: dev-info-error": "Failed to query device information. Please reconnect serial.",
    "text: ap-resp-error": "Failed to poll data.",
    "end": "end"
  },
  "zh": {
    "Connect": "连接",
    "Disconnect": "断开",
    "Serial Port": "串口",
    "WiFi MAC": "WiFi MAC",
    "Device SN": "SN",
    "Wallet Addr": "钱包地址",
    "Read": "读取",
    "Write": "写入",
    "text: dev-info-error": "获取设备信息失败，请再次连接串口。",
    "text: ap-resp-error": "获取数据失败。",
    "end": "结束"
  }
}
</i18n>
<template>
  <v-container fluid class="py-0">
    <v-row>
      <v-col cols="12">
        <v-form ref="form1">
          <v-row class="pt-3">
            <!-- Fields -->
            <!-- connection -->
            <v-col cols="6" class="d-flex justify-space-around">
              <v-select v-model="selectedSerialPort" :label="$t('Serial Port')" :items="serialPorts"
                :disabled="serialVSelectDisable" @focus="onSerialVSelectClicked" outlined dense hide-details>
              </v-select>
            </v-col>
            <v-col cols="6" class="d-flex justify-space-around">
              <v-btn rounded :color="connectBtnColor" width="200" @click="ConnectFn" dense>{{ connectBtnText }}</v-btn>
            </v-col>

            <!-- mac -->
            <v-col cols="6" class="py-0">
              <v-text-field v-model="wifiMAC" :label="$t('WiFi MAC')" disabled outlined dense>
              </v-text-field>
            </v-col>

            <!-- sn -->
            <v-col cols="12" class="py-0">
              <v-text-field v-model="deviceSN" :label="$t('Device SN')" :rules="deviceSNRules" outlined dense>
              </v-text-field>
            </v-col>

            <!-- wallet addr -->
            <v-col cols="12" class="py-0">
              <v-text-field v-model="WalletAddr" :label="$t('Wallet Addr')" :rules="WalletAddrRules" outlined dense>
              </v-text-field>
            </v-col>

            <!-- Buttons -->
            <v-col cols="12" class="py-0 d-flex justify-start">
              <v-spacer></v-spacer>
              <v-btn rounded color="secondary" width="100" class="mr-5" @click.stop="readFn()"
                :disabled="!serialOpened">{{ $t('Read') }}</v-btn>
              <v-btn rounded color="secondary" width="100" class="mr-5" @click.stop="writeFn()" :loading="writeLoading"
                :disabled="!serialOpened">{{ $t('Write') }}</v-btn>
            </v-col>
          </v-row>
        </v-form>
      </v-col>
    </v-row>

    <!-- footer -->
    <v-row>
      <v-col cols="auto" class="d-flex flex-column align-center justify-center">
        <div style="width: 4px">
          <v-menu top offset-y close-on-click>
            <template v-slot:activator="{ on }">
              <span class="flag-icon" :class="flagIconClass" v-on="on"></span>
            </template>
            <v-list dense class="pa-0">
              <v-list-item-group v-model="selectedLocale" color="primary" @change="onLocaleListClick">
                <v-list-item key="item1" class="py-0" link style="min-height: 30px;" value="en">
                  <v-list-item-title class="caption">English</v-list-item-title>
                </v-list-item>
                <v-list-item key="item2" class="py-0" link style="min-height: 30px;" value="zh">
                  <v-list-item-title class="caption">简体中文</v-list-item-title>
                </v-list-item>
              </v-list-item-group>
            </v-list>
          </v-menu>
        </div>
      </v-col>
      <v-col class="d-flex justify-center">
        <div>
          <v-img src="../assets/sensecap.png" width="32px" @click.stop="logoClicked()"></v-img>
        </div>
      </v-col>
      <v-col cols="auto" class="d-flex flex-column align-center justify-center caption grey--text">
        <div>
          <v-tooltip top open-delay="1000" :disabled="!newVersion">
            <template v-slot:activator="{ on }">
              <v-badge color="pink" dot top :value="newVersion">
                <span v-on="on" @click="versionClicked()" id="versionText">v{{ currentVersion }}</span>
              </v-badge>
            </template>
            <span>v{{ newVersion }} available</span>
          </v-tooltip>
        </div>
      </v-col>
    </v-row>

  </v-container>
</template>
  
<script>

const { ipcRenderer } = require('electron')
const { Readable } = require('stream')
import { Message } from 'element-ui'
const Store = require('electron-store');
const store = new Store();

const delayMs = ms => new Promise(res => setTimeout(res, ms))

export default {
  name: 'Home',
  data() {
    let rules = {
      required: value => !!value || this.$t("Required."),
      num18: value => (/^\d{18}$/.test(value)) || this.$t("Invalid 18-digit Number"),
      charAndNum: value => (/^[a-zA-Z0-9]{1,160}$/.test(value)) || this.$t("Invalid Input (1-160 characters)"),
    }
    return {
      //rules
      rules: rules,
      deviceSNRules: [rules.required, rules.num18],
      WalletAddrRules: [rules.required, rules.charAndNum],

      //serial
      selectedSerialPort: null,
      serialPorts: [],
      serialOpened: false,

      //ota
      currentVersion: '',
      newVersion: '',

      //i18n
      selectedLocale: 'en',
      localeBackup: 'en',

      //loading
      writeLoading: false,

      //config fields
      wifiMAC: '',
      deviceSN: '',
      WalletAddr: '',

      //stream parse
      stream: null,
      customParseCallback: null,

    }
  },
  computed: {
    flagIconClass: function () {
      return this.selectedLocale === 'zh' ? 'flag-icon-cn' : 'flag-icon-us'
    },
    connectBtnText: function () {
      return this.serialOpened ? this.$t('Disconnect') : this.$t('Connect')
    },
    connectBtnColor: function () {
      return this.serialOpened ? 'primary' : 'secondary'
    },
    serialVSelectDisable: function () {
      return this.serialOpened
    }
  },
  methods: {
    versionClicked() {
      ipcRenderer.send('goto-new-version')
    },

    //serial
    onSerialVSelectClicked() {
      ipcRenderer.send('init-serial-req')
      return true
    },
    ConnectFn() {
      console.log('start to connect:', this.selectedSerialPort)
      if (!this.selectedSerialPort) return
      if (!this.serialOpened) {
        ipcRenderer.send('serial-open-req', this.selectedSerialPort)
      } else {
        ipcRenderer.send('serial-close-req')
      }
    },
    //locale change
    onLocaleListClick() {
      if (this.selectedLocale === this.localeBackup) return
      console.log('going to change locale to:', this.selectedLocale)
      store.set('selectedLocale', this.selectedLocale)
      this.$root.$i18n.locale = this.selectedLocale
      ipcRenderer.send('locale-change', this.selectedLocale)
      this.localeBackup = this.selectedLocale
    },
    showErrorMessage() {
      // 使用 this.$message.error() 显示错误消息
      this.$message.error(this.$t('xxx'));
    },
    readFn() {
      this.wifiMAC = this.deviceSN = this.WalletAddr = ''

      ipcRenderer.send('dev-info-req')
      
      // this.hIntervalCheckDevInfo = setInterval(this.checkDeviceInfo, 2000)
    },

    writeFn() {
      this.deviceSN = this.deviceSN.trim()
      this.WalletAddr = this.WalletAddr.trim()

      if (!this.$refs.form1.validate()) return false

      this.writeLoading = true

      console.log({
        deviceSN: this.deviceSN,
        WalletAddr:  this.WalletAddr,
      })
      let deviceInfo = {'SN':this.deviceSN, 'Wallet':this.WalletAddr}
      ipcRenderer.send('dev-info-write', deviceInfo)

    }
  },
  created() {
    //locale
    console.log(`locale when created: ${this.$root.$i18n.locale}`)
  },
  mounted() {

    //serial
    ipcRenderer.on('init-serial-resp', (event, arg) => {
      console.log('init-serial-resp:', arg)
      let { ports, selectedPort, opened } = arg
      this.serialPorts = []
      for (let p of ports) {
        this.serialPorts.push(p.path)
      }
      this.selectedSerialPort = selectedPort
      this.serialOpened = opened
    })
    ipcRenderer.send('init-serial-req')

    ipcRenderer.on('serial-open-resp', (event, arg) => {
      console.log('serial-open-resp:', arg)
      let { opened, reason } = arg
      if (opened) {
        this.serialOpened = true
      } else {
        console.error('serial open failed:', reason)
      }
    })
    ipcRenderer.on('serial-close-resp', (event, arg) => {
      console.log('serial-close-resp:', arg)
      let { closed, reason } = arg
      if (closed) {
        this.serialOpened = false
        this.updateFwLoading = false
      } else {
        console.error('serial close failed:', reason)
      }
    })
    ipcRenderer.on('serial-tx', (event, arg) => {
      this.stream.push(arg)
    })

    //locale
    ipcRenderer.on('locale-change', (event, arg) => {
      console.log(`locale changed to:`, arg)
      this.$root.$i18n.locale = arg
    })

    //ota
    ipcRenderer.on('current-version-resp', (event, arg) => {
      console.log('current-version-resp:', arg)
      let { currentVersion } = arg
      this.currentVersion = currentVersion
    })
    ipcRenderer.send('current-version-req')

    ipcRenderer.on('update-available', (event, arg) => {
      console.log('update-available:', arg)
      this.newVersion = arg
      document.getElementById('versionText').style.cursor = 'pointer'
    })
    
    //comm
    ipcRenderer.on('dev-info-resp-error', (event, arg) => {
      console.log(arg)
      Message.error(arg)
    })
    ipcRenderer.on('dev-info-resp', (event, arg) => {
      let {'MAC':MAC, 'SN':SN, 'Wallet':Wallet} = arg
      this.wifiMAC = MAC
      this.deviceSN = SN
      this.WalletAddr = Wallet
    })

    ipcRenderer.on('dev-info-write-ack-error', (event, arg) => {
      this.writeLoading = false
      console.log(arg)
      Message.error(arg)
    })
    ipcRenderer.on('dev-info-write-ack', (event, arg) => {
      this.writeLoading = false
    })

  },
  beforeDestroy() {
    ipcRenderer.removeAllListeners()
  }
}
</script>
  
  