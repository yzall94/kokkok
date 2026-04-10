import { redirect } from 'next/navigation'

export default async function ShortRedirect({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  redirect(`/reveal?t=${token}`)
}
