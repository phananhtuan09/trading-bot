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
        return JSON.parse(fs.readFileSync(this.stateFilePath))
      }
      return this.getDefaultState()
    } catch (error) {
      console.error('Error loading state:', error)
      return this.getDefaultState()
    }
  }

  saveState() {
    fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2))
  }

  getDefaultState() {
    return {
      initialCapital: null,
      orderPlacementEnabled: true,
      ordersPlacedToday: 0,
      lastCheckDate: new Date().toISOString().split('T')[0],
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
}

module.exports = new StateManager()
