"use client"

import * as React from "react"
import type { ToastAction } from "@/components/ui/toast"
import { toast } from "@/components/ui/use-toast"

type ToastType = "default" | "success" | "error" | "warning" | "info"

interface ToastOptions {
  title?: string
  description: string
  action?: React.ReactElement<typeof ToastAction>
  duration?: number
}

/**
 * Custom hook for displaying toast notifications.
 * Provides a `showToast` function to trigger different types of toasts.
 */
export function useToast() {
  const showToast = React.useCallback((type: ToastType, options: ToastOptions) => {
    const { title, description, action, duration } = options

    let variant: "default" | "destructive" = "default"
    let defaultTitle = ""

    switch (type) {
      case "success":
        variant = "default"
        defaultTitle = "Success!"
        break
      case "error":
        variant = "destructive"
        defaultTitle = "Error!"
        break
      case "warning":
        variant = "default" // You might want a specific warning style
        defaultTitle = "Warning!"
        break
      case "info":
        variant = "default"
        defaultTitle = "Info"
        break
      case "default":
      default:
        variant = "default"
        defaultTitle = "Notification"
        break
    }

    toast({
      title: title || defaultTitle,
      description: description,
      action: action,
      duration: duration || 5000, // Default duration 5 seconds
      variant: variant,
    })
  }, [])

  return { showToast }
}
