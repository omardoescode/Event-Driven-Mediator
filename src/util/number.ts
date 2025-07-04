export function is_number_string(value: string) {
  const number_regex = /^-?\d+(\.\d+)?$/;
  return number_regex.test(value);
}
