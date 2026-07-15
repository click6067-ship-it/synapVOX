// App routes. AppLayout is the persistent frame (sidebar + routed main + global
// upload); every screen renders inside its <Outlet/>. The graph is a *mode*
// (/graph), not the home — the default entry is the structured Dashboard.
//   /            → Dashboard (overview: workbench + project shelf / onboarding)
//   /p/:project  → Dashboard (focused: outline + question dock)
//   /graph       → GraphModePage (scope=project|all via search params)
import { Route, Routes, useOutletContext } from 'react-router-dom'
import AppLayout, { type AppOutletContext } from './layout/AppLayout'
import Dashboard from './dashboard/Dashboard'
import GraphModePage from './pages/GraphModePage'

// Thin adapters: pull the shared nav callbacks off the Outlet context and hand
// them to the page as props (pages stay prop-driven / router-agnostic).
function DashboardRoute() {
  const ctx = useOutletContext<AppOutletContext>()
  return (
    <Dashboard
      onAddLecture={ctx.onAddLecture}
      onOpenGraph={ctx.onOpenGraph}
      onSelectProject={ctx.onSelectProject}
      onFocusQuestion={ctx.onFocusQuestion}
      onAskConcept={ctx.onAskConcept}
    />
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardRoute />} />
        <Route path="/p/:project" element={<DashboardRoute />} />
        <Route path="/graph" element={<GraphModePage />} />
      </Route>
    </Routes>
  )
}
