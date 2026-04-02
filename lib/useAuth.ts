'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from './auth'

export function useRequireAuth(requiredRole?: 'ngp' | 'cliente') {
  const router = useRouter()
  useEffect(() => {
    const sess = getSession()
    if (!sess || sess.auth !== '1') {
      router.replace('/login')
      return
    }
    if (requiredRole && sess.role !== requiredRole) {
      router.replace(sess.role === 'ngp' ? '/dashboard' : '/cliente')
    }
  }, [router, requiredRole])

  return getSession()
}
