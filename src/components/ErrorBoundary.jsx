import { Component } from 'react'

/** Catches any render/lifecycle error so one failure shows a recoverable screen
 *  instead of a blank page or a crash loop. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('SPUN error boundary caught:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message || 'An unexpected error occurred.'}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload SPUN</button>
        </div>
      )
    }
    return this.props.children
  }
}
