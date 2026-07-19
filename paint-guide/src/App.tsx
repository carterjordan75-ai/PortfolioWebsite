import { useState } from 'react'
import Dashboard from './components/Dashboard'
import ProjectView from './components/ProjectView'

type View = { name: 'dashboard' } | { name: 'project'; id: string }

export default function App() {
  const [view, setView] = useState<View>({ name: 'dashboard' })

  if (view.name === 'project') {
    return (
      <ProjectView
        projectId={view.id}
        onBack={() => setView({ name: 'dashboard' })}
      />
    )
  }
  return <Dashboard onOpen={(id) => setView({ name: 'project', id })} />
}
