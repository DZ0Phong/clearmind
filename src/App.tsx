import { ThemeProvider } from "@/components/theme-provider"
import { MainLayout } from "@/components/layout/main-layout"
import { Dashboard } from "@/pages/dashboard"
import { QuickCapture } from "@/components/quick-capture"

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="clearmind-theme">
      <MainLayout>
        <Dashboard />
      </MainLayout>
      <QuickCapture />
    </ThemeProvider>
  )
}

export default App
