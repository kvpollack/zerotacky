'use client'

import dynamic from 'next/dynamic'

const StrongmanApp = dynamic(() => import('./strongman-app'), { ssr: false })

export default function StrongmanAppLoader() {
  return <StrongmanApp />
}
