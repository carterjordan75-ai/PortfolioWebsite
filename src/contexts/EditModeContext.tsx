'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type PendingChanges = Record<string, Record<string, string>>

interface EditModeContextType {
  editMode: boolean
  toggleEditMode: () => void
  setEditMode: (v: boolean) => void
  pendingChanges: PendingChanges
  addChange: (slug: string, field: string, value: string) => void
  clearChanges: () => void
  changeCount: number
}

const EditModeContext = createContext<EditModeContextType>({
  editMode: false,
  toggleEditMode: () => {},
  setEditMode: () => {},
  pendingChanges: {},
  addChange: () => {},
  clearChanges: () => {},
  changeCount: 0,
})

export function EditModeProvider({ children }: { children: ReactNode }) {
  const [editMode, setEditMode] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<PendingChanges>({})

  const toggleEditMode = useCallback(() => setEditMode(v => !v), [])

  const addChange = useCallback((slug: string, field: string, value: string) => {
    setPendingChanges(prev => ({
      ...prev,
      [slug]: { ...(prev[slug] || {}), [field]: value },
    }))
  }, [])

  const clearChanges = useCallback(() => setPendingChanges({}), [])

  const changeCount = Object.values(pendingChanges).reduce(
    (sum, fields) => sum + Object.keys(fields).length, 0
  )

  return (
    <EditModeContext.Provider value={{ editMode, toggleEditMode, setEditMode, pendingChanges, addChange, clearChanges, changeCount }}>
      {children}
    </EditModeContext.Provider>
  )
}

export function useEditMode() {
  return useContext(EditModeContext)
}
