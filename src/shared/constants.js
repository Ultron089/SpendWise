export const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
export const AUTH_STORAGE_KEY = "spendwiseAuth";
export const PENDING_ORDERS_STORAGE_KEY = "spendwisePendingOrders";

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
