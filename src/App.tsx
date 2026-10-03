import { BrowserRouter } from 'react-router-dom'
import MarketplaceApp from './MarketplaceApp'
import { ScrollPositionRestoration } from './components/common/ScrollPositionRestoration'
import { CurrencyProvider } from './lib/CurrencyContext'

export default function App() {
	return <BrowserRouter><ScrollPositionRestoration /><CurrencyProvider><MarketplaceApp /></CurrencyProvider></BrowserRouter>
}
