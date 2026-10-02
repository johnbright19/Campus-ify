import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { prefersReducedMotion } from './utils'

gsap.registerPlugin(useGSAP)

// ---------------------------------------------------------------------------
// Motion, used on purpose (Architecture.md §9) — never decoration for its own
// sake. Every helper is a no-op under `prefers-reduced-motion`.
// ---------------------------------------------------------------------------

export { gsap, useGSAP }

/**
 * Stagger any `.reveal` children into place when the container mounts.
 * Returns the ref to attach to the scope element.
 */
export function useStaggerIn(dependencies = [], options = {}) {
  const scope = useRef(null)
  const { selector = '.reveal', from = {}, ...rest } = options
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      const targets = gsap.utils.toArray(selector)
      if (!targets.length) return
      gsap.from(targets, {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.06,
        ease: 'power2.out',
        clearProps: 'transform',
        ...from,
        ...rest,
      })
    },
    { scope, dependencies }
  )
  return scope
}

/** Fade + slide a page into view on route change. */
export function usePageTransition(dependency) {
  const scope = useRef(null)
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap.from(scope.current, {
        opacity: 0,
        y: 14,
        duration: 0.42,
        ease: 'power2.out',
        clearProps: 'all',
      })
    },
    { scope, dependencies: [dependency] }
  )
  return scope
}

/** Imperative helpers for moments the user must not miss. */

export function shake(el) {
  if (!el || prefersReducedMotion()) return
  gsap.fromTo(
    el,
    { x: -9 },
    { x: 0, duration: 0.55, ease: 'elastic.out(1, 0.32)', clearProps: 'x' }
  )
}

export function pulse(el) {
  if (!el || prefersReducedMotion()) return
  gsap.fromTo(
    el,
    { scale: 0.985, boxShadow: '0 0 0 0 rgba(52,211,153,0.55)' },
    {
      scale: 1,
      boxShadow: '0 0 0 16px rgba(52,211,153,0)',
      duration: 0.9,
      ease: 'power2.out',
      clearProps: 'all',
    }
  )
}

export function flashOnce(el) {
  if (!el || prefersReducedMotion()) return
  gsap.fromTo(el, { opacity: 0.35 }, { opacity: 1, duration: 0.6, ease: 'power1.out' })
}

export function staggerList(container) {
  if (!container || prefersReducedMotion()) return
  const items = container.querySelectorAll('[data-stagger]')
  if (!items.length) return
  gsap.from(items, {
    y: 16,
    opacity: 0,
    duration: 0.42,
    stagger: 0.07,
    ease: 'power2.out',
    clearProps: 'transform',
  })
}

/** Animate a number from its previous value to the next one. */
export function useCountUp(value, { duration = 1.1, decimals = 0, suffix = '' } = {}) {
  const ref = useRef(null)
  const previous = useRef(0)
  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      const render = (v) =>
        `${Number(v).toLocaleString('en-IN', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}${suffix}`
      if (prefersReducedMotion()) {
        el.textContent = render(value)
        previous.current = value
        return
      }
      const counter = { v: previous.current }
      gsap.to(counter, {
        v: Number(value) || 0,
        duration,
        ease: 'power2.out',
        onUpdate: () => {
          el.textContent = render(counter.v)
        },
        onComplete: () => {
          previous.current = Number(value) || 0
        },
      })
    },
    { dependencies: [value], revertOnUpdate: true }
  )
  return ref
}

/** Reveal a heat-map row by row. */
export function useRowReveal(dependency) {
  const scope = useRef(null)
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap.from('[data-heat-row]', {
        opacity: 0,
        x: -10,
        duration: 0.35,
        stagger: 0.035,
        ease: 'power1.out',
      })
    },
    { scope, dependencies: [dependency] }
  )
  return scope
}

export const EASE = { out: 'power2.out', spring: 'elastic.out(1, 0.35)' }
