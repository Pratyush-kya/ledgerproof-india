export function configuredReportReceiptAddress(value: string | undefined) {
  const address = value?.trim();

  if (
    !address ||
    !/^0x[0-9a-fA-F]{40}$/.test(address) ||
    /^0x0{40}$/i.test(address)
  ) {
    return null;
  }

  return address.toLowerCase();
}
