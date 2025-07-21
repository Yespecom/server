"use client"

import { useState, useEffect } from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Custom hook to detect if the current device is a mobile device.
 * It uses a combination of window width and user agent string.
 * @returns {boolean} True if the device is detected as mobile, false otherwise.
 */
export const useMobile = () => {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent
      const mobileRegex =
        /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|rim)|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i
      const tabletRegex = /android|ipad|playbook|silk/i

      const isMobileDevice = mobileRegex.test(userAgent) || tabletRegex.test(userAgent)
      const isSmallScreen = typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT // Tailwind's 'md' breakpoint

      setIsMobile(isMobileDevice || isSmallScreen)
    }

    checkMobile() // Check on mount
    if (typeof window !== "undefined") {
      window.addEventListener("resize", checkMobile) // Add resize listener

      return () => {
        window.removeEventListener("resize", checkMobile) // Clean up
      }
    }
  }, [])

  return isMobile
}
