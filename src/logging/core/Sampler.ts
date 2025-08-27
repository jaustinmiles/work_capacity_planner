/**
 * Intelligent sampling logic for performance optimization
 */

import { LogLevel, SamplingConfig, SamplingRates } from '../types'

export class Sampler {
  private config: SamplingConfig
  private errorFrequency: number[] = []
  private adaptiveRates: SamplingRates
  private lastAdaptiveUpdate: number = Date.now()
  private readonly ADAPTIVE_WINDOW = 60000 // 1 minute
  private readonly MAX_ERROR_FREQUENCY = 10 // errors per minute

  constructor(config: SamplingConfig) {
    this.config = config
    this.adaptiveRates = {
      errorRate: 1.0, // Always log errors
      warnRate: config.warnRate,
      infoRate: config.infoRate,
      debugRate: config.debugRate,
      traceRate: config.traceRate,
    }
  }

  /**
   * Determine if a log should be sampled
   */
  shouldSample(level: LogLevel, module?: string): boolean {
    // Always log in development if bypass is enabled
    if (this.config.bypassInDev && process.env.NODE_ENV === 'development') {
      return true
    }

    // Always log errors
    if (level === LogLevel.ERROR) {
      this.recordError()
      return true
    }

    // Get sampling rate for this level and module
    const rate = this.getSamplingRate(level, module)

    // Perform sampling decision
    return Math.random() < rate
  }

  /**
   * Get sampling rate for a specific level and module
   */
  private getSamplingRate(level: LogLevel, module?: string): number {
    // Check for module-specific overrides
    if (module && this.config.moduleOverrides?.[module]) {
      const override = this.config.moduleOverrides[module]
      const rateKey = this.getLevelRateKey(level)
      if (override[rateKey] !== undefined) {
        return override[rateKey]!
      }
    }

    // Use adaptive rates if enabled
    if (this.config.adaptiveSampling) {
      this.updateAdaptiveRates()
      return this.getAdaptiveRate(level)
    }

    // Use static configuration rates
    return this.getStaticRate(level)
  }

  /**
   * Get the rate key for a log level
   */
  private getLevelRateKey(level: LogLevel): keyof SamplingRates {
    switch (level) {
      case LogLevel.ERROR: return 'errorRate'
      case LogLevel.WARN: return 'warnRate'
      case LogLevel.INFO: return 'infoRate'
      case LogLevel.DEBUG: return 'debugRate'
      case LogLevel.TRACE: return 'traceRate'
    }
  }

  /**
   * Get static sampling rate
   */
  private getStaticRate(level: LogLevel): number {
    switch (level) {
      case LogLevel.ERROR: return 1.0
      case LogLevel.WARN: return this.config.warnRate
      case LogLevel.INFO: return this.config.infoRate
      case LogLevel.DEBUG: return this.config.debugRate
      case LogLevel.TRACE: return this.config.traceRate
    }
  }

  /**
   * Get adaptive sampling rate
   */
  private getAdaptiveRate(level: LogLevel): number {
    switch (level) {
      case LogLevel.ERROR: return 1.0
      case LogLevel.WARN: return this.adaptiveRates.warnRate
      case LogLevel.INFO: return this.adaptiveRates.infoRate
      case LogLevel.DEBUG: return this.adaptiveRates.debugRate
      case LogLevel.TRACE: return this.adaptiveRates.traceRate
    }
  }

  /**
   * Record an error occurrence for adaptive sampling
   */
  private recordError(): void {
    const now = Date.now()

    // Remove old error records outside the window
    this.errorFrequency = this.errorFrequency.filter(
      time => now - time < this.ADAPTIVE_WINDOW,
    )

    // Add new error
    this.errorFrequency.push(now)
  }

  /**
   * Update adaptive sampling rates based on error frequency
   */
  private updateAdaptiveRates(): void {
    const now = Date.now()

    // Only update every 10 seconds to avoid constant recalculation
    if (now - this.lastAdaptiveUpdate < 10000) {
      return
    }

    this.lastAdaptiveUpdate = now

    // Calculate error rate
    const errorRate = this.errorFrequency.length

    if (errorRate > this.MAX_ERROR_FREQUENCY) {
      // High error rate: Increase logging to capture more context
      this.adaptiveRates.warnRate = Math.min(1.0, this.config.warnRate * 2)
      this.adaptiveRates.infoRate = Math.min(1.0, this.config.infoRate * 1.5)
      this.adaptiveRates.debugRate = Math.min(1.0, this.config.debugRate * 1.2)
    } else if (errorRate === 0) {
      // No errors: Can reduce logging
      this.adaptiveRates.warnRate = this.config.warnRate * 0.8
      this.adaptiveRates.infoRate = this.config.infoRate * 0.5
      this.adaptiveRates.debugRate = this.config.debugRate * 0.3
      this.adaptiveRates.traceRate = this.config.traceRate * 0.2
    } else {
      // Normal error rate: Use configured rates
      this.adaptiveRates = {
        errorRate: 1.0,
        warnRate: this.config.warnRate,
        infoRate: this.config.infoRate,
        debugRate: this.config.debugRate,
        traceRate: this.config.traceRate,
      }
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SamplingConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current sampling statistics
   */
  getStats(): {
    errorFrequency: number
    currentRates: SamplingRates
    adaptiveEnabled: boolean
  } {
    return {
      errorFrequency: this.errorFrequency.length,
      currentRates: this.config.adaptiveSampling ? this.adaptiveRates : {
        errorRate: 1.0,
        warnRate: this.config.warnRate,
        infoRate: this.config.infoRate,
        debugRate: this.config.debugRate,
        traceRate: this.config.traceRate,
      },
      adaptiveEnabled: this.config.adaptiveSampling,
    }
  }
}
