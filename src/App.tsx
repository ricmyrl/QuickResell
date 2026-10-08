import { BrowserRouter } from 'react-router-dom'
import MarketplaceApp from './MarketplaceApp'
import { ScrollPositionRestoration } from './components/common/ScrollPositionRestoration'
import { AndroidBackGesture } from './components/common/AndroidBackGesture'
import { CurrencyProvider } from './lib/CurrencyContext'

export default function App() {
	return <BrowserRouter><ScrollPositionRestoration /><CurrencyProvider><MarketplaceApp /><AndroidBackGesture /></CurrencyProvider></BrowserRouter>
}
