const path = require('path')
const fs = require('fs')

class StateManager {
  constructor() {
    this.stateFilePath = path.join(__dirname, 'botState.json')
    this.deleteFile()
    this.state = this.loadStateFirstTime()
    this.saveStateToFile()
  }
  getState() {
    return this.state
  }

  setState(newState = {}) {
    this.state = { ...this.getState(), ...newState }
  }

  saveStateToFile(state = {}) {
    try {
      const newState = { ...this.getState(), ...state }
      fs.writeFileSync(this.stateFilePath, JSON.stringify(newState, null, 2))
    } catch (error) {
      console.error(`Error saving state to ${this.stateFilePath}:`, error.message)
    }
  }

  setStateAndSaveToFile(state = {}) {
    this.setState(state)
    this.saveStateToFile(state)
  }

  syncStateFromFile() {
    const stateFromFile = this.loadStateFromFile()
    if (stateFromFile) {
      this.setState(stateFromFile)
    }
  }

  loadStateFirstTime() {
    const stateFromFile = this.loadStateFromFile()
    return stateFromFile ?? this.getDefaultState()
  }

  loadStateFromFile() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = fs.readFileSync(this.stateFilePath)
        return JSON.parse(data)
      }
    } catch (error) {
      console.error(`Error loading state from ${this.stateFilePath}:`, error.message)
      return null
    }
  }

  getDefaultState() {
    return {
      initialCapital: null, // Initial account balance
      orderPlacementEnabled: true, // Whether order placement is enabled
      ordersPlacedToday: 0, // Orders placed today
      totalOrders: 0, // Total orders placed
      totalCapital: 0, // Total capital used
      lastCheckDate: new Date().toISOString().split('T')[0], // Last date checked for daily reset
    }
  }

  resetDailyOrders() {
    const today = new Date().toISOString().split('T')[0]
    if (this.state.lastCheckDate !== today) {
      const newState = {
        ordersPlacedToday: 0,
        lastCheckDate: today,
      }
      this.setStateAndSaveToFile(newState)
    }
  }

  deleteFile() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        fs.unlinkSync(this.stateFilePath)
      }
    } catch (error) {
      console.error('Error deleting state file:', error.message)
    }
  }
}

module.exports = new StateManager()
