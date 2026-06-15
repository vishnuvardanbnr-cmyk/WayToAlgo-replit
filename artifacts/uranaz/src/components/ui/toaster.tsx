import { AlertCircle, CheckCircle2, Info } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

const variantIcon: Record<string, { icon: React.ElementType; color: string }> = {
  destructive: { icon: AlertCircle, color: "rgb(248,113,113)" },
  success:     { icon: CheckCircle2, color: "rgb(52,211,153)" },
  default:     { icon: Info,         color: "#5B8CFF" },
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const v = (variant ?? "default") as string
        const { icon: Icon, color } = variantIcon[v] ?? variantIcon.default

        return (
          <Toast key={id} variant={variant} {...props}>
            <div
              className="shrink-0 mt-0.5 rounded-full p-1"
              style={{ background: `${color}18`, border: `1px solid ${color}33` }}
            >
              <Icon size={14} style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
