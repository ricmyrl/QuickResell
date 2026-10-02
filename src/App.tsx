import { BrowserRouter } from 'react-router-dom'
import MarketplaceApp from './MarketplaceApp'
import { CurrencyProvider } from './lib/CurrencyContext'
import { CurrencySelector } from './components/common/CurrencySelector'

export default function App() {
	return <BrowserRouter><CurrencyProvider><MarketplaceApp /><CurrencySelector mobile /></CurrencyProvider></BrowserRouter>
}
