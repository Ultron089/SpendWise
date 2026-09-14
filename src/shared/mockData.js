export const mockUser = {
  name: "Riya Sharma",
  plan: "Growth plan",
};

export const mockSummary = {
  totalSpending: 12450,
  monthlySpending: 12450,
  purchases: 18,
  topCategory: "Electronics",
  monthLabel: "September 2026",
  currency: "INR",
};

export const categoryBreakdown = [
  { name: "Food", amount: 3200 },
  { name: "Personal Care", amount: 1850 },
  { name: "Electronics", amount: 4200 },
  { name: "Healthcare", amount: 1100 },
  { name: "Clothing", amount: 2100 },
  { name: "Gifts", amount: 1000 },
];

export const monthlySpending = [
  { month: "Jan", amount: 7800 },
  { month: "Feb", amount: 9200 },
  { month: "Mar", amount: 8600 },
  { month: "Apr", amount: 10150 },
  { month: "May", amount: 11800 },
  { month: "Jun", amount: 10950 },
  { month: "Jul", amount: 9800 },
  { month: "Aug", amount: 11150 },
  { month: "Sep", amount: 12450 },
];

export const platformBreakdown = [
  { name: "Amazon", amount: 5600 },
  { name: "Flipkart", amount: 3400 },
  { name: "Myntra", amount: 1800 },
  { name: "Other", amount: 1650 },
];

export const recentPurchases = [
  {
    id: 1,
    platform: "Amazon",
    product: "Sony Headphones",
    amount: 2999,
    category: "Electronics",
    date: "2026-09-12",
  },
  {
    id: 2,
    platform: "Amazon",
    product: "Dove Shampoo",
    amount: 249,
    category: "Personal Care",
    date: "2026-09-11",
  },
  {
    id: 3,
    platform: "Myntra",
    product: "T-Shirt",
    amount: 999,
    category: "Clothing",
    date: "2026-09-09",
  },
  {
    id: 4,
    platform: "Amazon",
    product: "Pizza",
    amount: 450,
    category: "Food",
    date: "2026-09-08",
  },
  {
    id: 5,
    platform: "Flipkart",
    product: "Skin Care Kit",
    amount: 799,
    category: "Healthcare",
    date: "2026-09-06",
  },
  {
    id: 6,
    platform: "Amazon",
    product: "Gift Box",
    amount: 1200,
    category: "Gifts",
    date: "2026-09-03",
  },
];

export const mockDashboardData = {
  user: mockUser,
  summary: mockSummary,
  categories: categoryBreakdown,
  monthlySpending,
  platforms: platformBreakdown,
  purchases: recentPurchases,
};
