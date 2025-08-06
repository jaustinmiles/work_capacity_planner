import React from 'react'
import { Message as ArcoMessage } from '@arco-design/web-react'

// Wrapper for Arco Message to handle React 19 compatibility issues
export const Message = {
  success: (content: string) => {
    try {
      ArcoMessage.success(content)
    } catch (error) {
      console.log('✅', content)
    }
  },
  error: (content: string) => {
    try {
      ArcoMessage.error(content)
    } catch (error) {
      console.error('❌', content)
    }
  },
  warning: (content: string) => {
    try {
      ArcoMessage.warning(content)
    } catch (error) {
      console.warn('⚠️', content)
    }
  },
  info: (content: string) => {
    try {
      ArcoMessage.info(content)
    } catch (error) {
      console.info('ℹ️', content)
    }
  },
}