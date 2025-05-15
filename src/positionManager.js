// src/positionManager.js
const fs = require('fs')
const path = require('path')
const { binanceTestClient: binanceClient } = require('../src/clients')

class PositionManager {
  constructor() {
    this.filePath = path.join(__dirname, 'activePositions.json')
    this.initFile()
  }

  initFile() {
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '[]')
    }
  }

  getPositions() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
    } catch (error) {
      console.error('Lỗi đọc file positions:', error)
      return []
    }
  }

  savePositions(positions) {
    fs.writeFileSync(this.filePath, JSON.stringify(positions, null, 2))
  }

  addPosition(position) {
    const positions = this.getPositions()
    const existingIndex = positions.findIndex((p) => p.symbol === position.symbol)

    if (existingIndex > -1) {
      positions[existingIndex] = position // Update existing position
    } else {
      positions.push(position) // Add new position
    }

    this.savePositions(positions)
    return positions
  }

  removePosition(symbol) {
    const positions = this.getPositions()
    const newPositions = positions.filter((p) => p.symbol !== symbol)
    this.savePositions(newPositions)
    return newPositions
  }

  updatePosition(symbol, newData) {
    const positions = this.getPositions()
    const index = positions.findIndex((p) => p.symbol === symbol)

    if (index > -1) {
      positions[index] = { ...positions[index], ...newData }
      this.savePositions(positions)
      return positions[index]
    }

    return null
  }

  async syncWithBinance() {
    try {
      const binancePositions = await binanceClient.futuresPositionRisk()
      const activePositions = binancePositions.filter((p) => Math.abs(parseFloat(p.positionAmt)) > 0)

      const currentPositions = this.getPositions()

      // Remove positions not in Binance
      const validPositions = currentPositions.filter((cp) => activePositions.some((ap) => ap.symbol === cp.symbol))

      // Update positions data
      const updatedPositions = validPositions.map((cp) => {
        const binanceData = activePositions.find((ap) => ap.symbol === cp.symbol)
        return {
          ...cp,
          quantity: parseFloat(binanceData.positionAmt),
          entryPrice: parseFloat(binanceData.entryPrice),
          markPrice: parseFloat(binanceData.markPrice),
        }
      })

      this.savePositions(updatedPositions)
      return updatedPositions
    } catch (error) {
      console.error('Lỗi đồng bộ positions:', error)
      return this.getPositions()
    }
  }
}

module.exports = new PositionManager()
