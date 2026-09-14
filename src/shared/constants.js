export const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export const categoryColors = {
  Food: "#4f46e5",
  "Personal Care": "#14b8a6",
  Electronics: "#f59e0b",
  Healthcare: "#ef4444",
  Clothing: "#8b5cf6",
  Gifts: "#06b6d4",
  Other: "#64748b",
};

export const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
];
