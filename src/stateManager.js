const path = require('path')
const fs = require('fs')

class StateManager {
  constructor() {
    this.stateFilePath = path.join(__dirname, 'botState.json')
    this.state = this.loadState()
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = fs.readFileSync(this.stateFilePath)
        const state = JSON.parse(data)
        // Validate state
        const defaultState = this.getDefaultState()
        return { ...defaultState, ...state }
      }
      return this.getDefaultState()
    } catch (error) {
      console.error(`Error loading state from ${this.stateFilePath}:`, error.message)
      return this.getDefaultState()
    }
  }

  saveState() {
    try {
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2))
    } catch (error) {
      console.error(`Error saving state to ${this.stateFilePath}:`, error.message)
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

  resetDailyOrdersIfNeeded() {
    const today = new Date().toISOString().split('T')[0]
    if (this.state.lastCheckDate !== today) {
      this.state.ordersPlacedToday = 0
      this.state.lastCheckDate = today
      this.saveState()
    }
  }

  deleteFile() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        fs.unlinkSync(this.stateFilePath)
        console.log(`State file ${this.stateFilePath} deleted successfully`)
      }
      this.state = this.getDefaultState()
    } catch (error) {
      console.error('Error deleting state file:', error.message)
    }
  }
}

module.exports = new StateManager()
