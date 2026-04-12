'use client'

import { useEffect } from 'react'
import { signOut } from '@/app/login/actions'

// V22 Safety Threshold: 24 Hours (in milliseconds)
const INACTIVITY_THRESHOLD = 24 * 60 * 60 * 1000 

export function InactivityGuard() {
    useEffect(() => {
        const updateLastActive = () => {
            localStorage.setItem('v22_last_active', Date.now().toString())
        }

        const checkInactivity = async () => {
            const lastActiveStored = localStorage.getItem('v22_last_active')
            if (lastActiveStored) {
                const lastActiveTime = parseInt(lastActiveStored)
                const diff = Date.now() - lastActiveTime
                
                if (diff > INACTIVITY_THRESHOLD) {
                    console.log(`[V22 Guard] 24-hour inactivity limit reached. Initiating auto-logout...`)
                    await signOut()
                }
            } else {
                updateLastActive()
            }
        }

        // 1. Immediate Check on Load
        checkInactivity()

        // 2. Event Listeners for Activity Tracking
        const activeEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
        activeEvents.forEach(e => window.addEventListener(e, updateLastActive))

        // 3. Periodic Background Scan (Every 10 Minutes to save resources)
        const scanTimer = setInterval(checkInactivity, 10 * 60 * 1000)

        return () => {
            activeEvents.forEach(e => window.removeEventListener(e, updateLastActive))
            clearInterval(scanTimer)
        }
    }, [])

    return null // Global invisible monitor
}
