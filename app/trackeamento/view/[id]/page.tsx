import { Suspense } from 'react'
import { FormViewerPage } from '@/components/trackeamento/viewer/FormViewerPage'

export default function TrackeamentoViewPage({ params }: { params: { id: string } }) {
  return (
    <div className="trackeamento-theme">
      <Suspense>
        <FormViewerPage id={params.id} />
      </Suspense>
    </div>
  )
}
