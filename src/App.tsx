import { BrowserRouter } from 'react-router-dom'
import MarketplaceApp from './MarketplaceApp'
import { CurrencyProvider } from './lib/CurrencyContext'

export default function App() {
	return <BrowserRouter><CurrencyProvider><MarketplaceApp /></CurrencyProvider></BrowserRouter>
}
