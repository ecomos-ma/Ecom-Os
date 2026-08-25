/**
 * Public Landing Page
 * Displays published AI-generated landing pages without authentication
 */

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface LandingPageData {
  id: string
  generated_content: any
  style_version: any
  published_url: string
}

export default function PublicLandingPage() {
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [page, setPage] = useState<LandingPageData | null>(null)

  useEffect(() => {
    loadLandingPage()
  }, [id])

  const loadLandingPage = async () => {
    if (!id) return

    try {
      const { data, error } = await supabase
        .from('ai_landing_pages')
        .select('*')
        .eq('id', id)
        .eq('status', 'published')
        .single()

      if (error || !data) {
        setError(true)
        return
      }

      setPage(data)
    } catch (err) {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand mx-auto"></div>
          <p className="mt-4 text-ink-muted">Loading...</p>
        </div>
      </div>
    )
  }

  if (error || !page) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-ink mb-2">Page Not Found</h1>
          <p className="text-ink-muted">This landing page does not exist or is not published.</p>
        </div>
      </div>
    )
  }

  const content = page.generated_content

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            {content?.hero?.headline || 'Amazing Product'}
          </h1>
          <p className="text-xl text-slate-300 mb-8">
            {content?.hero?.subheadline || 'Transform your life with our revolutionary product'}
          </p>
          <button className="bg-brand px-8 py-4 rounded-xl font-medium text-lg hover:bg-brand/90 transition">
            {content?.hero?.cta || 'Get Started'}
          </button>
        </div>
      </div>

      {/* Benefits Section */}
      {content?.benefits && content.benefits.length > 0 && (
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Why Choose Us</h2>
            <div className="grid md:grid-cols-3 gap-8">
              {content.benefits.map((benefit: string, idx: number) => (
                <div key={idx} className="bg-slate-800 rounded-xl p-6">
                  <p className="text-slate-300">{benefit}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Testimonials Section */}
      {content?.testimonials && content.testimonials.length > 0 && (
        <div className="container mx-auto px-4 py-16 bg-slate-800">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">What Our Customers Say</h2>
            <div className="grid md:grid-cols-2 gap-8">
              {content.testimonials.map((testimonial: any, idx: number) => (
                <div key={idx} className="bg-slate-900 rounded-xl p-6">
                  <p className="text-slate-300 mb-4">"{testimonial.text}"</p>
                  <p className="font-medium">{testimonial.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* FAQ Section */}
      {content?.faq && content.faq.length > 0 && (
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {content.faq.map((item: any, idx: number) => (
                <div key={idx} className="bg-slate-800 rounded-xl p-6">
                  <h3 className="font-medium mb-2">{item.question}</h3>
                  <p className="text-slate-300">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CTA Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to Get Started?</h2>
          <button className="bg-brand px-8 py-4 rounded-xl font-medium text-lg hover:bg-brand/90 transition">
            Order Now
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-800 py-8">
        <div className="container mx-auto px-4 text-center text-slate-400">
          <p>&copy; {new Date().getFullYear()} All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}
