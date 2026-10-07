export function formatNotificationMessage(
  message: string,
  formatUsd: (amount: number) => string,
): string {
  return message.replace(/\$(\d[\d,]*(?:\.\d{1,2})?)/g, (price) => {
    const amount = Number(price.slice(1).replace(/,/g, ''))
    return Number.isFinite(amount) ? formatUsd(amount) : price
  })
}
