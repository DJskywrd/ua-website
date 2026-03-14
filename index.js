const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const ordersPath = path.join(__dirname, 'orders.json');
const itemsPath = path.join(__dirname, 'items.json');
const expensesPath = path.join(__dirname, 'expenses.json');

const ensureJsonFile = (filePath, defaultValue) => {
  if (fs.existsSync(filePath)) {
    return;
  }

  fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 4) + '\n', 'utf-8');
};

ensureJsonFile(ordersPath, []);
ensureJsonFile(itemsPath, []);
ensureJsonFile(expensesPath, []);

// Routes
app.post('/save-orders', (req, res) => {
  const { orderUpdates } = req.body;

  if (!Array.isArray(orderUpdates)) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  let orders = [];
  let items = [];
  try {
    const ordersRaw = fs.readFileSync(ordersPath, 'utf-8');
    const itemsRaw = fs.readFileSync(itemsPath, 'utf-8');
    const parsedOrders = JSON.parse(ordersRaw);
    const parsedItems = JSON.parse(itemsRaw);
    orders = Array.isArray(parsedOrders) ? parsedOrders : [];
    items = Array.isArray(parsedItems) ? parsedItems : [];
  } catch (err) {
    res.status(500).json({ error: 'Unable to load orders.json or items.json' });
    return;
  }

  orderUpdates.forEach((update) => {
    const orderIndex = Number(update.orderIndex);

    if (Number.isInteger(orderIndex) && orderIndex >= 0 && orderIndex < orders.length) {
      const customer = String(update.customer ?? '').trim();
      const item = Number(update.item);
      const quantity = Number(update.quantity);
      const paid = String(update.paid ?? '').toLowerCase() === 'true';
      orders[orderIndex].status = String(update.status ?? '');
      orders[orderIndex].paid = paid;
      const price = Number(update.price);
      const materialPrice = Number(update.materialPrice);

      if (customer) {
        orders[orderIndex].customer = customer;
      }

      if (Number.isInteger(item) && item >= 1 && item <= items.length) {
        orders[orderIndex].item = item;
      }

      if (Number.isInteger(quantity) && quantity > 0) {
        orders[orderIndex].quantity = quantity;
      }

      if (!Number.isNaN(price)) {
        orders[orderIndex].price = price;
      }

      if (!Number.isNaN(materialPrice)) {
        orders[orderIndex].material_cost = materialPrice;
      }
    }
  });

  try {
    fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 4) + '\n', 'utf-8');
  } catch (err) {
    res.status(500).json({ error: 'Unable to save orders.json' });
    return;
  }

  res.json({ success: true });
});

app.post('/admin/delete-order', (req, res) => {
  const orderId = Number(req.body.orderId);

  if (!Number.isInteger(orderId) || orderId < 1) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  let orders = [];
  try {
    const ordersRaw = fs.readFileSync(ordersPath, 'utf-8');
    const parsedOrders = JSON.parse(ordersRaw);
    orders = Array.isArray(parsedOrders) ? parsedOrders : [];
  } catch (err) {
    res.status(500).json({ error: 'Unable to load orders.json' });
    return;
  }

  const orderIndex = orderId - 1;
  if (orderIndex >= orders.length) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  orders.splice(orderIndex, 1);

  try {
    fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 4) + '\n', 'utf-8');
  } catch (err) {
    res.status(500).json({ error: 'Unable to save orders.json' });
    return;
  }

  res.json({ success: true });
});

app.post('/admin/create-item', (req, res) => {
  const name = String(req.body.name ?? '').trim();
  const price = Number(req.body.price);
  const materialPrice = Number(req.body.materialPrice);

  if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(materialPrice) || materialPrice < 0) {
    res.status(400).json({ error: 'Invalid item data' });
    return;
  }

  let items = [];
  try {
    const itemsRaw = fs.readFileSync(itemsPath, 'utf-8');
    const parsedItems = JSON.parse(itemsRaw);
    items = Array.isArray(parsedItems) ? parsedItems : [];
  } catch (err) {
    res.status(500).json({ error: 'Unable to load items.json' });
    return;
  }

  items.push({
    name,
    price,
    material_price: materialPrice
  });

  try {
    fs.writeFileSync(itemsPath, JSON.stringify(items, null, 4) + '\n', 'utf-8');
  } catch (err) {
    res.status(500).json({ error: 'Unable to save items.json' });
    return;
  }

  res.json({ success: true });
});

app.post('/admin/delete-item', (req, res) => {
  const itemId = Number(req.body.itemId);

  if (!Number.isInteger(itemId) || itemId < 1) {
    res.status(400).json({ error: 'Invalid item ID' });
    return;
  }

  let items = [];
  let orders = [];
  try {
    const itemsRaw = fs.readFileSync(itemsPath, 'utf-8');
    const ordersRaw = fs.readFileSync(ordersPath, 'utf-8');
    const parsedItems = JSON.parse(itemsRaw);
    const parsedOrders = JSON.parse(ordersRaw);
    items = Array.isArray(parsedItems) ? parsedItems : [];
    orders = Array.isArray(parsedOrders) ? parsedOrders : [];
  } catch (err) {
    res.status(500).json({ error: 'Unable to load data files' });
    return;
  }

  const itemIndex = itemId - 1;
  if (itemIndex >= items.length) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  const inUse = orders.some((order) => Number(order.item) === itemId);
  if (inUse) {
    res.status(400).json({ error: 'Cannot delete item used by existing orders' });
    return;
  }

  items.splice(itemIndex, 1);

  // Keep item numbers in existing orders in sync after removing an item.
  orders.forEach((order) => {
    const currentItem = Number(order.item);
    if (Number.isInteger(currentItem) && currentItem > itemId) {
      order.item = currentItem - 1;
    }
  });

  try {
    fs.writeFileSync(itemsPath, JSON.stringify(items, null, 4) + '\n', 'utf-8');
    fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 4) + '\n', 'utf-8');
  } catch (err) {
    res.status(500).json({ error: 'Unable to save data files' });
    return;
  }

  res.json({ success: true });
});

app.get('/place-order', (req, res) => {
  let items = [];
  try {
    const itemsRaw = fs.readFileSync(itemsPath, 'utf-8');
    const parsedItems = JSON.parse(itemsRaw);
    items = Array.isArray(parsedItems) ? parsedItems : [];
  } catch (err) {
    res.status(500).send('Unable to load items.json');
    return;
  }

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const itemOptions = items
    .map((item, index) => {
      const itemNumber = index + 1;
      const itemPrice = Number.isFinite(Number(item.price)) ? Number(item.price) : 0;
      const itemMaterialCost = Number.isFinite(Number(item.material_price)) ? Number(item.material_price) : 0;
      return `<option value="${itemNumber}" data-price="${escapeHtml(itemPrice)}" data-material-cost="${escapeHtml(itemMaterialCost)}">${escapeHtml(item.name ?? `Item ${itemNumber}`)}</option>`;
    })
    .join('');

  const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Place Order</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 24px;
      color: #e5e7eb;
      background: linear-gradient(180deg, #0b1220 0%, #111827 100%);
      min-height: 100vh;
      box-sizing: border-box;
      display: flex;
      justify-content: center;
    }
    .page {
      width: 100%;
      max-width: 700px;
    }
    .header-row {
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    h1 {
      margin: 0;
      color: #bfdbfe;
    }
    .action-link {
      display: inline-block;
      text-decoration: none;
      border: 1px solid #3b82f6;
      background: #1d4ed8;
      color: #ffffff;
      padding: 8px 14px;
      border-radius: 10px;
      font-weight: 600;
    }
    .action-link:hover {
      background: #2563eb;
    }
    form {
      background: #0f172a;
      border: 1px solid #1e3a8a;
      border-radius: 14px;
      padding: 16px;
      box-shadow: 0 10px 24px rgba(2, 6, 23, 0.5);
      display: grid;
      gap: 12px;
    }
    label {
      display: grid;
      gap: 6px;
      color: #dbeafe;
      font-weight: 600;
    }
    input,
    select {
      border: 1px solid #1d4ed8;
      background: #111827;
      border-radius: 8px;
      padding: 8px 10px;
      color: #e5e7eb;
      font-weight: 500;
    }
    button {
      margin-top: 4px;
      border: 1px solid #3b82f6;
      background: #1d4ed8;
      color: #ffffff;
      padding: 10px 14px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 700;
      justify-self: start;
    }
    button:hover {
      background: #2563eb;
    }
    @media (max-width: 640px) {
      body {
        padding: 16px;
      }
      .header-row {
        align-items: stretch;
      }
      .action-link,
      button {
        width: 100%;
        text-align: center;
      }
      button {
        justify-self: stretch;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header-row">
      <h1>Place Order</h1>
      <a class="action-link" href="/">Back To Orders</a>
    </div>
    <form method="post" action="/place-order">
      <label>
        Customer
        <input type="text" name="customer" required />
      </label>
      <label>
        Item
        <select id="itemSelect" name="item" required>
          ${itemOptions || '<option value="1">Item 1</option>'}
        </select>
      </label>
      <label>
        Price
        <input id="priceInput" type="number" name="price" step="0.01" min="0" required />
      </label>
      <label>
        Material Cost
        <input id="materialCostInput" type="number" name="material_cost" step="0.01" min="0" required />
      </label>
      <label>
        Quantity
        <input type="number" name="quantity" min="1" value="1" required />
      </label>
      <button type="submit">Add Order</button>
    </form>
  </div>
  <script>
    const itemSelect = document.getElementById('itemSelect');
    const priceInput = document.getElementById('priceInput');
    const materialCostInput = document.getElementById('materialCostInput');

    const autofillFromSelectedItem = () => {
      const selected = itemSelect.options[itemSelect.selectedIndex];
      if (!selected) return;
      priceInput.value = selected.dataset.price ?? '';
      materialCostInput.value = selected.dataset.materialCost ?? '';
    };

    itemSelect.addEventListener('change', autofillFromSelectedItem);
    autofillFromSelectedItem();
  </script>
</body>
</html>`;

  res.send(html);
});

app.get('/business-expenses', (req, res) => {
  let orders = [];
  let expenses = [];
  try {
    const ordersRaw = fs.readFileSync(ordersPath, 'utf-8');
    const expensesRaw = fs.readFileSync(expensesPath, 'utf-8');
    const parsedOrders = JSON.parse(ordersRaw);
    const parsedExpenses = JSON.parse(expensesRaw);
    orders = Array.isArray(parsedOrders) ? parsedOrders : [];
    expenses = Array.isArray(parsedExpenses) ? parsedExpenses : [];
  } catch (err) {
    res.status(500).send('Unable to load orders.json or expenses.json');
    return;
  }

  const grossMoneyMade = orders.reduce((total, order) => {
    const quantity = Number(order.quantity) || 0;
    const price = Number(order.price) || 0;
    return total + (price * quantity);
  }, 0);
  const totalBusinessExpenses = expenses.reduce((total, expense) => {
    const cost = Number(expense.cost) || 0;
    return total + cost;
  }, 0);
  const totalMoneyMade = grossMoneyMade - totalBusinessExpenses;
  const totalMaterialCosts = orders.reduce((total, order) => {
    const quantity = Number(order.quantity) || 0;
    const materialCost = Number(order.material_cost) || 0;
    return total + (materialCost * quantity);
  }, 0);
  const totalProfits = grossMoneyMade - totalMaterialCosts;
  const profitPercentage = grossMoneyMade > 0 ? (totalProfits / grossMoneyMade) * 100 : 0;
  const paidOrderMoney = orders.reduce((total, order) => {
    if (!order.paid) {
      return total;
    }
    const quantity = Number(order.quantity) || 0;
    const price = Number(order.price) || 0;
    return total + (price * quantity);
  }, 0);
  const currentBusinessMoney = paidOrderMoney - totalBusinessExpenses;
  const expenseRows = expenses
    .map((expense, index) => {
      const item = String(expense.item ?? '');
      const cost = Number(expense.cost);
      const displayCost = Number.isFinite(cost) ? cost.toFixed(2) : '0.00';
      return [
        `<tr data-expense-index="${index}">`,
        '<td data-label="Item">',
        `<span class="display-value" data-field="item">${item}</span>`,
        `<input class="edit-field" data-field="item" type="text" value="${item}" />`,
        '</td>',
        '<td data-label="Cost">',
        `<span class="display-value" data-field="cost">$${displayCost}</span>`,
        `<input class="edit-field" data-field="cost" type="number" step="0.01" min="0" value="${displayCost}" />`,
        '</td>',
        '<td data-label="Action">',
        `<form method="post" action="/delete-business-expense/${index}" class="inline-form delete-expense-form">`,
        '<button type="submit" class="danger-btn">Delete</button>',
        '</form>',
        '</td>',
        '</tr>'
      ].join('');
    })
    .join('');

  const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Business Expenses</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 24px;
      color: #e5e7eb;
      background: linear-gradient(180deg, #0b1220 0%, #111827 100%);
      min-height: 100vh;
      box-sizing: border-box;
      display: flex;
      justify-content: center;
    }
    .page {
      width: 100%;
      max-width: 1000px;
    }
    .header-row {
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .header-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    h1 {
      margin: 0;
      color: #bfdbfe;
    }
    .action-link {
      display: inline-block;
      text-decoration: none;
      border: 1px solid #3b82f6;
      background: #1d4ed8;
      color: #ffffff;
      padding: 8px 14px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 600;
    }
    .action-link:hover {
      background: #2563eb;
    }
    button {
      border: 1px solid #3b82f6;
      background: #1d4ed8;
      color: #ffffff;
      padding: 8px 14px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 600;
    }
    button:hover {
      background: #2563eb;
    }
    .danger-btn {
      border: 1px solid #dc2626;
      background: #991b1b;
      color: #ffffff;
      padding: 6px 10px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 600;
      min-width: 0;
    }
    .danger-btn:hover {
      background: #b91c1c;
    }
    .controls {
      margin-top: 14px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .summary {
      margin-top: 14px;
      background: #0b1220;
      border: 1px solid #1e3a8a;
      border-radius: 12px;
      padding: 12px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
    }
    .summary-item {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 10px;
      padding: 10px;
    }
    .summary-item.featured {
      grid-column: 1 / -1;
      padding: 18px;
      border-color: #2563eb;
      background: linear-gradient(135deg, rgba(29, 78, 216, 0.28) 0%, rgba(17, 24, 39, 0.96) 70%);
      box-shadow: inset 0 1px 0 rgba(191, 219, 254, 0.08);
    }
    .summary-label {
      font-size: 12px;
      color: #93c5fd;
      margin-bottom: 4px;
    }
    .summary-value {
      font-size: 18px;
      font-weight: 700;
      color: #e5e7eb;
    }
    .summary-item.featured .summary-label {
      font-size: 13px;
      color: #bfdbfe;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .summary-item.featured .summary-value {
      font-size: 42px;
      line-height: 1.05;
      font-weight: 800;
      color: #ffffff;
    }
    .page-note {
      color: #93c5fd;
      font-size: 14px;
      margin: 0;
    }
    .expenses-section {
      margin-top: 16px;
      background: #0b1220;
      border: 1px solid #1e3a8a;
      border-radius: 12px;
      padding: 12px;
    }
    .table-wrap {
      width: 100%;
      overflow-x: auto;
      padding-bottom: 2px;
    }
    .section-title {
      margin: 0 0 10px;
      color: #dbeafe;
      font-size: 16px;
    }
    .inline-form {
      margin: 0;
    }
    input {
      border: 1px solid #1d4ed8;
      background: #111827;
      border-radius: 8px;
      padding: 6px 8px;
      color: #e5e7eb;
    }
    .edit-field {
      display: none;
    }
    body.editing .display-value {
      display: none;
    }
    body.editing .edit-field {
      display: inline-block;
      width: 100%;
      box-sizing: border-box;
    }
    #saveExpensesBtn {
      display: none;
    }
    body.editing #editExpensesBtn {
      display: none;
    }
    body.editing #saveExpensesBtn {
      display: inline-block;
    }
    body.editing .delete-expense-form {
      display: none;
    }
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.72);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
    }
    .modal-overlay.open {
      display: flex;
    }
    .modal-card {
      width: 100%;
      max-width: 420px;
      background: #0f172a;
      border: 1px solid #1e3a8a;
      border-radius: 14px;
      box-shadow: 0 10px 24px rgba(2, 6, 23, 0.5);
      padding: 16px;
    }
    .modal-title {
      margin: 0 0 8px;
      color: #dbeafe;
      font-size: 18px;
    }
    .modal-text {
      margin: 0;
      color: #93c5fd;
      line-height: 1.5;
    }
    .modal-actions {
      margin-top: 14px;
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .secondary-btn {
      border-color: #334155;
      background: #1f2937;
    }
    .secondary-btn:hover {
      background: #334155;
    }
    table {
      border-collapse: separate;
      border-spacing: 0;
      width: 100%;
      min-width: 420px;
      background: #0f172a;
      border: 1px solid #1e3a8a;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 10px 24px rgba(2, 6, 23, 0.5);
    }
    th, td {
      border-bottom: 1px solid #1f2937;
      padding: 10px;
      text-align: left;
    }
    th {
      background: #172554;
      color: #dbeafe;
      font-weight: 600;
    }
    tbody tr:last-child td {
      border-bottom: none;
    }
    @media (max-width: 640px) {
      body {
        padding: 16px;
      }
      .header-row {
        align-items: stretch;
      }
      .header-actions,
      .controls,
      .modal-actions {
        flex-direction: column;
      }
      .header-actions > *,
      .controls > *,
      .modal-actions > * {
        width: 100%;
      }
      .action-link,
      button {
        text-align: center;
      }
      .summary {
        grid-template-columns: 1fr;
      }
      .summary-item.featured {
        padding: 14px;
      }
      .summary-item.featured .summary-value {
        font-size: 32px;
      }
      .table-wrap {
        overflow-x: visible;
      }
      table,
      thead,
      tbody,
      tr,
      th,
      td {
        display: block;
        width: 100%;
      }
      thead {
        display: none;
      }
      table {
        min-width: 0;
        border: none;
        background: transparent;
        box-shadow: none;
      }
      tbody {
        display: grid;
        gap: 12px;
      }
      tr {
        background: #0f172a;
        border: 1px solid #1e3a8a;
        border-radius: 14px;
        overflow: hidden;
        box-shadow: 0 10px 24px rgba(2, 6, 23, 0.5);
      }
      th,
      td {
        padding: 8px;
        border-bottom: 1px solid #1f2937;
      }
      td {
        display: grid;
        grid-template-columns: minmax(110px, 42%) minmax(0, 1fr);
        gap: 10px;
        align-items: center;
      }
      td::before {
        content: attr(data-label);
        color: #93c5fd;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      tbody tr td:last-child {
        border-bottom: none;
      }
      body.editing .edit-field {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header-row">
      <div>
        <h1>Business Expenses</h1>
        <p class="page-note">Starting with total money made. Additional business metrics can be added here later.</p>
      </div>
      <div class="header-actions">
        <a class="action-link" href="/add-business-expense">Add Expense</a>
        <a class="action-link" href="/">Back To Orders</a>
      </div>
    </div>
    <div class="summary">
      <div class="summary-item featured">
        <div class="summary-label">Current Business Money</div>
        <div class="summary-value">$${currentBusinessMoney.toFixed(2)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Total Expected Revenue</div>
        <div class="summary-value">$${grossMoneyMade.toFixed(2)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Material Costs</div>
        <div class="summary-value">$${totalMaterialCosts.toFixed(2)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Profits</div>
        <div class="summary-value">$${totalProfits.toFixed(2)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Profit Percentage</div>
        <div class="summary-value">${profitPercentage.toFixed(2)}%</div>
      </div>
    </div>
    <div class="expenses-section">
      <h2 class="section-title">Business Expenses</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Cost</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${expenseRows || '<tr><td colspan="3">No business expenses found</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="controls">
        <button id="editExpensesBtn" type="button">Edit Expenses</button>
        <button id="saveExpensesBtn" type="button">Save Changes</button>
        <button id="deleteAllExpensesBtn" class="danger-btn" type="button">Delete All</button>
      </div>
    </div>
  </div>
  <div id="deleteAllModal" class="modal-overlay" aria-hidden="true">
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="deleteAllModalTitle">
      <h2 id="deleteAllModalTitle" class="modal-title">Delete All Expenses?</h2>
      <p class="modal-text">This will permanently remove every business expense entry from the page and from <code>expenses.json</code>.</p>
      <div class="modal-actions">
        <button id="cancelDeleteAllBtn" class="secondary-btn" type="button">Cancel</button>
        <form method="post" action="/delete-all-business-expenses">
          <button class="danger-btn" type="submit">Delete Everything</button>
        </form>
      </div>
    </div>
  </div>
  <script>
    const editExpensesBtn = document.getElementById('editExpensesBtn');
    const saveExpensesBtn = document.getElementById('saveExpensesBtn');
    const deleteAllExpensesBtn = document.getElementById('deleteAllExpensesBtn');
    const deleteAllModal = document.getElementById('deleteAllModal');
    const cancelDeleteAllBtn = document.getElementById('cancelDeleteAllBtn');

    const setDeleteAllModalOpen = (isOpen) => {
      deleteAllModal.classList.toggle('open', isOpen);
      deleteAllModal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    };

    editExpensesBtn.addEventListener('click', () => {
      document.body.classList.add('editing');
    });

    deleteAllExpensesBtn.addEventListener('click', () => {
      setDeleteAllModalOpen(true);
    });

    cancelDeleteAllBtn.addEventListener('click', () => {
      setDeleteAllModalOpen(false);
    });

    deleteAllModal.addEventListener('click', (event) => {
      if (event.target === deleteAllModal) {
        setDeleteAllModalOpen(false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setDeleteAllModalOpen(false);
      }
    });

    saveExpensesBtn.addEventListener('click', async () => {
      const rows = Array.from(document.querySelectorAll('tbody tr[data-expense-index]'));
      const expenseUpdates = rows.map((row) => {
        const itemInput = row.querySelector('input[data-field="item"]');
        const costInput = row.querySelector('input[data-field="cost"]');

        return {
          expenseIndex: Number(row.dataset.expenseIndex),
          item: itemInput ? itemInput.value : '',
          cost: costInput ? costInput.value : ''
        };
      });

      const response = await fetch('/save-business-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenseUpdates })
      });

      if (!response.ok) {
        alert('Unable to save changes.');
        return;
      }

      window.location.reload();
    });
  </script>
</body>
</html>`;

  res.send(html);
});

app.post('/save-business-expenses', (req, res) => {
  const { expenseUpdates } = req.body;

  if (!Array.isArray(expenseUpdates)) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  let expenses = [];
  try {
    const expensesRaw = fs.readFileSync(expensesPath, 'utf-8');
    const parsedExpenses = JSON.parse(expensesRaw);
    expenses = Array.isArray(parsedExpenses) ? parsedExpenses : [];
  } catch (err) {
    res.status(500).json({ error: 'Unable to load expenses.json' });
    return;
  }

  expenseUpdates.forEach((update) => {
    const expenseIndex = Number(update.expenseIndex);
    if (!Number.isInteger(expenseIndex) || expenseIndex < 0 || expenseIndex >= expenses.length) {
      return;
    }

    const item = String(update.item ?? '').trim();
    const cost = Number(update.cost);

    if (item) {
      expenses[expenseIndex].item = item;
    }

    if (!Number.isNaN(cost) && cost >= 0) {
      expenses[expenseIndex].cost = cost;
    }
  });

  try {
    fs.writeFileSync(expensesPath, JSON.stringify(expenses, null, 4) + '\n', 'utf-8');
  } catch (err) {
    res.status(500).json({ error: 'Unable to save expenses.json' });
    return;
  }

  res.json({ success: true });
});

app.post('/admin/delete-all-orders', (req, res) => {
  try {
    fs.writeFileSync(ordersPath, JSON.stringify([], null, 4) + '\n', 'utf-8');
  } catch (err) {
    res.status(500).send('Unable to save orders.json');
    return;
  }

  res.redirect('/');
});

app.post('/delete-all-business-expenses', (req, res) => {
  try {
    fs.writeFileSync(expensesPath, JSON.stringify([], null, 4) + '\n', 'utf-8');
  } catch (err) {
    res.status(500).send('Unable to save expenses.json');
    return;
  }

  res.redirect('/business-expenses');
});

app.post('/delete-business-expense/:expenseIndex', (req, res) => {
  const expenseIndex = Number(req.params.expenseIndex);

  if (!Number.isInteger(expenseIndex) || expenseIndex < 0) {
    res.status(400).send('Invalid expense index');
    return;
  }

  let expenses = [];
  try {
    const expensesRaw = fs.readFileSync(expensesPath, 'utf-8');
    const parsedExpenses = JSON.parse(expensesRaw);
    expenses = Array.isArray(parsedExpenses) ? parsedExpenses : [];
  } catch (err) {
    res.status(500).send('Unable to load expenses.json');
    return;
  }

  if (expenseIndex >= expenses.length) {
    res.status(404).send('Expense not found');
    return;
  }

  expenses.splice(expenseIndex, 1);

  try {
    fs.writeFileSync(expensesPath, JSON.stringify(expenses, null, 4) + '\n', 'utf-8');
  } catch (err) {
    res.status(500).send('Unable to save expenses.json');
    return;
  }

  res.redirect('/business-expenses');
});

app.get('/add-business-expense', (req, res) => {
  const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Add Business Expense</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 24px;
      color: #e5e7eb;
      background: linear-gradient(180deg, #0b1220 0%, #111827 100%);
      min-height: 100vh;
      box-sizing: border-box;
      display: flex;
      justify-content: center;
    }
    .page {
      width: 100%;
      max-width: 700px;
    }
    .header-row {
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    h1 {
      margin: 0;
      color: #bfdbfe;
    }
    .action-link {
      display: inline-block;
      text-decoration: none;
      border: 1px solid #3b82f6;
      background: #1d4ed8;
      color: #ffffff;
      padding: 8px 14px;
      border-radius: 10px;
      font-weight: 600;
    }
    .action-link:hover {
      background: #2563eb;
    }
    form {
      background: #0f172a;
      border: 1px solid #1e3a8a;
      border-radius: 14px;
      padding: 16px;
      box-shadow: 0 10px 24px rgba(2, 6, 23, 0.5);
      display: grid;
      gap: 12px;
    }
    label {
      display: grid;
      gap: 6px;
      color: #dbeafe;
      font-weight: 600;
    }
    input {
      border: 1px solid #1d4ed8;
      background: #111827;
      border-radius: 8px;
      padding: 8px 10px;
      color: #e5e7eb;
      font-weight: 500;
    }
    button {
      margin-top: 4px;
      border: 1px solid #3b82f6;
      background: #1d4ed8;
      color: #ffffff;
      padding: 10px 14px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 700;
      justify-self: start;
    }
    button:hover {
      background: #2563eb;
    }
    @media (max-width: 640px) {
      body {
        padding: 16px;
      }
      .header-row {
        align-items: stretch;
      }
      .action-link,
      button {
        width: 100%;
        text-align: center;
      }
      button {
        justify-self: stretch;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header-row">
      <h1>Add Business Expense</h1>
      <a class="action-link" href="/business-expenses">Back To Expenses</a>
    </div>
    <form method="post" action="/add-business-expense">
      <label>
        Item
        <input type="text" name="item" required />
      </label>
      <label>
        Cost
        <input type="number" name="cost" step="0.01" min="0" required />
      </label>
      <button type="submit">Add Expense</button>
    </form>
  </div>
</body>
</html>`;

  res.send(html);
});

app.post('/add-business-expense', (req, res) => {
  const item = String(req.body.item ?? '').trim();
  const cost = Number(req.body.cost);

  if (!item || !Number.isFinite(cost) || cost < 0) {
    res.status(400).send('Invalid expense data');
    return;
  }

  let expenses = [];
  try {
    const expensesRaw = fs.readFileSync(expensesPath, 'utf-8');
    const parsedExpenses = JSON.parse(expensesRaw);
    expenses = Array.isArray(parsedExpenses) ? parsedExpenses : [];
  } catch (err) {
    res.status(500).send('Unable to load expenses.json');
    return;
  }

  expenses.push({
    item,
    cost
  });

  try {
    fs.writeFileSync(expensesPath, JSON.stringify(expenses, null, 4) + '\n', 'utf-8');
  } catch (err) {
    res.status(500).send('Unable to save expenses.json');
    return;
  }

  res.redirect('/business-expenses');
});

app.post('/place-order', (req, res) => {
  const customer = String(req.body.customer ?? '').trim();
  const item = Number(req.body.item);
  const price = Number(req.body.price);
  const materialCost = Number(req.body.material_cost);
  const quantity = Number(req.body.quantity);

  if (
    !customer ||
    !Number.isInteger(item) ||
    item < 1 ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isFinite(materialCost) ||
    materialCost < 0 ||
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    res.status(400).send('Invalid order data');
    return;
  }

  let orders = [];
  try {
    const ordersRaw = fs.readFileSync(ordersPath, 'utf-8');
    const parsedOrders = JSON.parse(ordersRaw);
    orders = Array.isArray(parsedOrders) ? parsedOrders : [];
  } catch (err) {
    res.status(500).send('Unable to load orders.json');
    return;
  }

  orders.push({
    customer,
    item,
    price,
    material_cost: materialCost,
    quantity,
    status: 'Recieved',
    paid: false
  });

  try {
    fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 4) + '\n', 'utf-8');
  } catch (err) {
    res.status(500).send('Unable to save orders.json');
    return;
  }

  res.redirect('/');
});

app.get('/api/orders/create', (req, res) => {
  const customer = String(req.query.customer ?? '').trim();
  const item = Number(req.query.item);
  const hasPrice = req.query.price !== undefined && req.query.price !== '';
  const hasMaterialCost = req.query.material_cost !== undefined && req.query.material_cost !== '';
  const hasStatus = req.query.status !== undefined && String(req.query.status).trim() !== '';
  const hasPaid = req.query.paid !== undefined && String(req.query.paid).trim() !== '';
  const priceFromQuery = Number(req.query.price);
  const materialCostFromQuery = Number(req.query.material_cost);
  const quantity = Number(req.query.quantity);
  const status = hasStatus ? String(req.query.status).trim() : 'Recieved';
  const paid = hasPaid ? String(req.query.paid).toLowerCase() === 'true' : false;

  if (
    !customer ||
    !Number.isInteger(item) ||
    item < 1 ||
    (hasPrice && (!Number.isFinite(priceFromQuery) || priceFromQuery < 0)) ||
    (hasMaterialCost && (!Number.isFinite(materialCostFromQuery) || materialCostFromQuery < 0)) ||
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    res.status(400).json({ error: 'Invalid order data' });
    return;
  }

  let orders = [];
  let items = [];
  try {
    const ordersRaw = fs.readFileSync(ordersPath, 'utf-8');
    const itemsRaw = fs.readFileSync(itemsPath, 'utf-8');
    const parsedOrders = JSON.parse(ordersRaw);
    const parsedItems = JSON.parse(itemsRaw);
    orders = Array.isArray(parsedOrders) ? parsedOrders : [];
    items = Array.isArray(parsedItems) ? parsedItems : [];
  } catch (err) {
    res.status(500).json({ error: 'Unable to load data files' });
    return;
  }

  if (item > items.length) {
    res.status(400).json({ error: 'Item does not exist' });
    return;
  }

  const selectedItem = items[item - 1] || {};
  const defaultPrice = Number.isFinite(Number(selectedItem.price)) ? Number(selectedItem.price) : 0;
  const defaultMaterialCost = Number.isFinite(Number(selectedItem.material_price)) ? Number(selectedItem.material_price) : 0;
  const price = hasPrice ? priceFromQuery : defaultPrice;
  const materialCost = hasMaterialCost ? materialCostFromQuery : defaultMaterialCost;

  const newOrder = {
    customer,
    item,
    price,
    material_cost: materialCost,
    quantity,
    status,
    paid
  };
  orders.push(newOrder);

  try {
    fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 4) + '\n', 'utf-8');
  } catch (err) {
    res.status(500).json({ error: 'Unable to save orders.json' });
    return;
  }

  res.status(201).json({
    success: true,
    orderId: orders.length,
    order: newOrder
  });
});

app.get('/api/orders', (req, res) => {
  let orders = [];
  let items = [];
  try {
    const ordersRaw = fs.readFileSync(ordersPath, 'utf-8');
    const itemsRaw = fs.readFileSync(itemsPath, 'utf-8');
    const parsedOrders = JSON.parse(ordersRaw);
    const parsedItems = JSON.parse(itemsRaw);
    orders = Array.isArray(parsedOrders) ? parsedOrders : [];
    items = Array.isArray(parsedItems) ? parsedItems : [];
  } catch (err) {
    res.status(500).json({ error: 'Unable to load data files' });
    return;
  }

  res.json({
    success: true,
    orders: orders.map((order, index) => ({ id: index + 1, ...order })),
    items
  });
});

app.get('/api/orders/mark-delivered', (req, res) => {
  const orderId = Number(req.query.orderId);

  if (!Number.isInteger(orderId) || orderId < 1) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  let orders = [];
  try {
    const ordersRaw = fs.readFileSync(ordersPath, 'utf-8');
    const parsedOrders = JSON.parse(ordersRaw);
    orders = Array.isArray(parsedOrders) ? parsedOrders : [];
  } catch (err) {
    res.status(500).json({ error: 'Unable to load orders.json' });
    return;
  }

  const orderIndex = orderId - 1;
  if (orderIndex >= orders.length) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  orders[orderIndex].status = 'Delivered';

  try {
    fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 4) + '\n', 'utf-8');
  } catch (err) {
    res.status(500).json({ error: 'Unable to save orders.json' });
    return;
  }

  res.json({
    success: true,
    orderId,
    order: { id: orderId, ...orders[orderIndex] }
  });
});

app.get('/api/orders/mark-paid', (req, res) => {
  const orderId = Number(req.query.orderId);

  if (!Number.isInteger(orderId) || orderId < 1) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  let orders = [];
  try {
    const ordersRaw = fs.readFileSync(ordersPath, 'utf-8');
    const parsedOrders = JSON.parse(ordersRaw);
    orders = Array.isArray(parsedOrders) ? parsedOrders : [];
  } catch (err) {
    res.status(500).json({ error: 'Unable to load orders.json' });
    return;
  }

  const orderIndex = orderId - 1;
  if (orderIndex >= orders.length) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  orders[orderIndex].paid = true;

  try {
    fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 4) + '\n', 'utf-8');
  } catch (err) {
    res.status(500).json({ error: 'Unable to save orders.json' });
    return;
  }

  res.json({
    success: true,
    orderId,
    order: { id: orderId, ...orders[orderIndex] }
  });
});

app.get('/', (req, res) => {
  let orders = [];
  let items = [];
  try {
    const ordersRaw = fs.readFileSync(ordersPath, 'utf-8');
    const itemsRaw = fs.readFileSync(itemsPath, 'utf-8');
    const parsedOrders = JSON.parse(ordersRaw);
    const parsedItems = JSON.parse(itemsRaw);
    orders = Array.isArray(parsedOrders) ? parsedOrders : [];
    items = Array.isArray(parsedItems) ? parsedItems : [];
  } catch (err) {
    res.status(500).send('Unable to load orders.json or items.json');
    return;
  }

  const categories = orders.length > 0 ? Object.keys(orders[0]) : [];

  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const capitalizeLabel = (label) =>
    String(label)
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  const getStatusTone = (status) => {
    const normalized = String(status ?? '').toLowerCase();
    if (normalized === 'delivered') {
      return 'green';
    }
    if (normalized === 'recieved' || normalized === 'printed') {
      return 'yellow';
    }
    return 'neutral';
  };
  const getPaidTone = (paid) => (paid ? 'green' : 'red');

  const headerCells = ['ID', ...categories]
    .map((category) => `<th>${escapeHtml(capitalizeLabel(category))}</th>`)
    .join('');
  const cellLabelByCategory = {
    customer: 'Customer',
    item: 'Item',
    price: 'Price',
    material_cost: 'Material Cost',
    quantity: 'Quantity',
    status: 'Status',
    paid: 'Paid'
  };
  const itemAdminOptions = items
    .map((item, index) => {
      const itemNumber = index + 1;
      return `<option value="${itemNumber}">#${itemNumber} - ${escapeHtml(item.name ?? `Item ${itemNumber}`)}</option>`;
    })
    .join('');

  const totals = orders.reduce(
    (acc, order) => {
      const quantity = Number(order.quantity) || 0;
      const price = Number(order.price) || 0;
      const materialCost = Number(order.material_cost) || 0;
      acc.totalPrice += price * quantity;
      acc.totalMaterialCost += materialCost * quantity;
      return acc;
    },
    { totalPrice: 0, totalMaterialCost: 0 }
  );
  const totalProfit = totals.totalPrice - totals.totalMaterialCost;
  const profitPercent = totals.totalPrice > 0 ? (totalProfit / totals.totalPrice) * 100 : 0;

  const rows = orders
    .map((order, index) => {
      const itemPosition = Number(order.item) - 1;
      const itemData =
        Number.isInteger(itemPosition) && itemPosition >= 0 && itemPosition < items.length
          ? items[itemPosition]
          : null;

      const dataCells = categories.map((category) => {
        if (category === 'status') {
          const statusOptions = ['Recieved', 'Printed', 'Delivered'];
          const currentStatus = String(order.status ?? '').toLowerCase();
          const statusTone = getStatusTone(order.status);
          const optionsHtml = statusOptions
            .map((option) => {
              const selected =
                currentStatus === option.toLowerCase() ? ' selected' : '';
              return `<option value="${escapeHtml(option)}"${selected}>${escapeHtml(option)}</option>`;
            })
            .join('');

          return [
            `<td data-label="${escapeHtml(cellLabelByCategory[category] ?? capitalizeLabel(category))}">`,
            `<span class="display-value status-pill status-${statusTone}" data-field="status">${escapeHtml(order.status ?? '')}</span>`,
            `<select class="edit-field status-select status-${statusTone}" data-field="status">${optionsHtml}</select>`,
            '</td>'
          ].join('');
        }

        if (category === 'price') {
          return [
            `<td data-label="${escapeHtml(cellLabelByCategory[category] ?? capitalizeLabel(category))}">`,
            `<span class="display-value" data-field="price">${escapeHtml(order.price ?? '')}</span>`,
            `<input class="edit-field" data-field="price" type="number" step="0.01" value="${escapeHtml(order.price ?? '')}" />`,
            '</td>'
          ].join('');
        }

        if (category === 'material_cost') {
          return [
            `<td data-label="${escapeHtml(cellLabelByCategory[category] ?? capitalizeLabel(category))}">`,
            `<span class="display-value" data-field="material-price">${escapeHtml(order.material_cost ?? '')}</span>`,
            `<input class="edit-field" data-field="material-price" type="number" step="0.01" value="${escapeHtml(order.material_cost ?? '')}" />`,
            '</td>'
          ].join('');
        }

        if (category === 'customer') {
          return [
            `<td data-label="${escapeHtml(cellLabelByCategory[category] ?? capitalizeLabel(category))}">`,
            `<span class="display-value" data-field="customer">${escapeHtml(order.customer ?? '')}</span>`,
            `<input class="edit-field" data-field="customer" type="text" value="${escapeHtml(order.customer ?? '')}" />`,
            '</td>'
          ].join('');
        }

        if (category === 'paid') {
          const paidOptions = [
            { label: 'Paid', value: 'true' },
            { label: 'Not Paid', value: 'false' }
          ];
          const paidTone = getPaidTone(Boolean(order.paid));
          const optionsHtml = paidOptions
            .map((option) => {
              const selected = Boolean(order.paid) === (option.value === 'true') ? ' selected' : '';
              return `<option value="${option.value}"${selected}>${option.label}</option>`;
            })
            .join('');

          return [
            `<td data-label="${escapeHtml(cellLabelByCategory[category] ?? capitalizeLabel(category))}">`,
            `<span class="display-value status-pill status-${paidTone}" data-field="paid">${Boolean(order.paid) ? 'Paid' : 'Not Paid'}</span>`,
            `<select class="edit-field status-select status-${paidTone}" data-field="paid">${optionsHtml}</select>`,
            '</td>'
          ].join('');
        }

        if (category === 'quantity') {
          return [
            `<td data-label="${escapeHtml(cellLabelByCategory[category] ?? capitalizeLabel(category))}">`,
            `<span class="display-value" data-field="quantity">${escapeHtml(order.quantity ?? '')}</span>`,
            `<input class="edit-field" data-field="quantity" type="number" min="1" step="1" value="${escapeHtml(order.quantity ?? '')}" />`,
            '</td>'
          ].join('');
        }

        if (category !== 'item') {
          return `<td data-label="${escapeHtml(cellLabelByCategory[category] ?? capitalizeLabel(category))}">${escapeHtml(order[category])}</td>`;
        }

        const itemName = itemData?.name ?? 'Unknown Item';
        const itemOptionsHtml = items
          .map((item, itemIndex) => {
            const itemNumber = itemIndex + 1;
            const selected = itemNumber === Number(order.item) ? ' selected' : '';
            return `<option value="${itemNumber}"${selected}>${escapeHtml(item.name ?? `Item ${itemNumber}`)}</option>`;
          })
          .join('');
        return [
          `<td data-label="${escapeHtml(cellLabelByCategory[category] ?? capitalizeLabel(category))}">`,
          `<span class="display-value" data-field="item">${escapeHtml(itemName)}</span>`,
          `<select class="edit-field" data-field="item">${itemOptionsHtml}</select>`,
          '</td>'
        ].join('');
      }).join('');

      return `<tr data-order-index="${index}" data-quantity="${escapeHtml(order.quantity ?? 0)}"><td data-label="ID">${index + 1}</td>${dataCells}</tr>`;
    })
    .join('');

  const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Orders</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 24px;
      color: #e5e7eb;
      background: linear-gradient(180deg, #0b1220 0%, #111827 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      box-sizing: border-box;
    }
    .page {
      width: 100%;
      max-width: 1220px;
      position: relative;
    }
    .dashboard {
      display: grid;
      grid-template-columns: 1fr;
      gap: 18px;
    }
    .main-panel {
      min-width: 0;
      overflow: hidden;
    }
    .table-wrap {
      width: 100%;
      overflow-x: auto;
      padding-bottom: 2px;
    }
    .admin-panel {
      position: fixed;
      top: 0;
      left: 0;
      width: min(360px, calc(100vw - 32px));
      height: 100vh;
      overflow-y: auto;
      background: #0f172a;
      border: 1px solid #1e3a8a;
      border-radius: 0 18px 18px 0;
      box-shadow: 0 16px 40px rgba(2, 6, 23, 0.65);
      padding: 20px 14px 14px;
      display: grid;
      gap: 12px;
      z-index: 30;
      transform: translateX(calc(-100% - 24px));
      opacity: 0;
      transition: transform 260ms ease, opacity 220ms ease;
    }
    body.admin-open .admin-panel {
      transform: translateX(0);
      opacity: 1;
    }
    .admin-overlay {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.52);
      backdrop-filter: blur(4px);
      opacity: 0;
      pointer-events: none;
      transition: opacity 260ms ease;
      z-index: 20;
    }
    body.admin-open .admin-overlay {
      opacity: 1;
      pointer-events: auto;
    }
    .admin-title {
      margin: 0;
      color: #dbeafe;
      font-size: 18px;
    }
    .admin-card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 10px;
      padding: 10px;
      display: grid;
      gap: 8px;
    }
    .admin-card h3 {
      margin: 0;
      font-size: 14px;
      color: #93c5fd;
      font-weight: 700;
    }
    .admin-message {
      min-height: 18px;
      font-size: 12px;
      color: #93c5fd;
    }
    .header-row {
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    h1 {
      color: #bfdbfe;
      margin: 0;
    }
    table {
      border-collapse: separate;
      border-spacing: 0;
      width: 100%;
      background: #0f172a;
      border: 1px solid #1e3a8a;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 10px 24px rgba(2, 6, 23, 0.5);
    }
    th, td {
      border-bottom: 1px solid #1f2937;
      padding: 10px;
      text-align: left;
    }
    th {
      background: #172554;
      color: #dbeafe;
      font-weight: 600;
    }
    tbody tr:last-child td {
      border-bottom: none;
    }
    .controls {
      margin-top: 14px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .edit-field {
      display: none;
    }
    body.editing .display-value {
      display: none;
    }
    body.editing .edit-field {
      display: inline-block;
    }
    #saveChangesBtn {
      display: none;
    }
    body.editing #editOrdersBtn {
      display: none;
    }
    body.editing #saveChangesBtn {
      display: inline-block;
    }
    button {
      border: 1px solid #3b82f6;
      background: #1d4ed8;
      color: #ffffff;
      padding: 8px 14px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 600;
    }
    button:hover {
      background: #2563eb;
    }
    .drawer-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(29, 78, 216, 0.22);
      border-color: rgba(96, 165, 250, 0.45);
      backdrop-filter: blur(8px);
    }
    .drawer-toggle:hover {
      background: rgba(37, 99, 235, 0.34);
    }
    .drawer-toggle-bars {
      width: 14px;
      height: 10px;
      position: relative;
      display: inline-block;
    }
    .drawer-toggle-bars::before,
    .drawer-toggle-bars::after,
    .drawer-toggle-bars span {
      content: "";
      position: absolute;
      left: 0;
      width: 14px;
      height: 2px;
      border-radius: 999px;
      background: #dbeafe;
      transition: transform 220ms ease, opacity 220ms ease, top 220ms ease;
    }
    .drawer-toggle-bars::before {
      top: 0;
    }
    .drawer-toggle-bars span {
      top: 4px;
    }
    .drawer-toggle-bars::after {
      top: 8px;
    }
    body.admin-open .drawer-toggle-bars::before {
      top: 4px;
      transform: rotate(45deg);
    }
    body.admin-open .drawer-toggle-bars span {
      opacity: 0;
    }
    body.admin-open .drawer-toggle-bars::after {
      top: 4px;
      transform: rotate(-45deg);
    }
    .danger-btn {
      border-color: #dc2626;
      background: #991b1b;
    }
    .danger-btn:hover {
      background: #b91c1c;
    }
    .action-link {
      display: inline-block;
      text-decoration: none;
      border: 1px solid #3b82f6;
      background: #1d4ed8;
      color: #ffffff;
      padding: 8px 14px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 600;
    }
    .action-link:hover {
      background: #2563eb;
    }
    input,
    select {
      border: 1px solid #1d4ed8;
      background: #111827;
      border-radius: 8px;
      padding: 6px 8px;
      color: #e5e7eb;
      max-width: 100%;
    }
    .status-pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-weight: 600;
      border: 1px solid transparent;
    }
    .status-select.status-yellow,
    .status-pill.status-yellow {
      background: #422006;
      border-color: #92400e;
      color: #fef3c7;
    }
    .status-select.status-green,
    .status-pill.status-green {
      background: #052e16;
      border-color: #166534;
      color: #dcfce7;
    }
    .status-select.status-red,
    .status-pill.status-red {
      background: #450a0a;
      border-color: #b91c1c;
      color: #fecaca;
    }
    .status-select.status-neutral,
    .status-pill.status-neutral {
      background: #1f2937;
      border-color: #374151;
      color: #e5e7eb;
    }
    .summary {
      margin-top: 14px;
      background: #0b1220;
      border: 1px solid #1e3a8a;
      border-radius: 12px;
      padding: 12px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
    }
    .summary-item {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 10px;
      padding: 10px;
    }
    .summary-label {
      font-size: 12px;
      color: #93c5fd;
      margin-bottom: 4px;
    }
    .summary-value {
      font-size: 18px;
      font-weight: 700;
      color: #e5e7eb;
    }
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.72);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
      z-index: 40;
    }
    .modal-overlay.open {
      display: flex;
    }
    .modal-card {
      width: 100%;
      max-width: 420px;
      background: #0f172a;
      border: 1px solid #1e3a8a;
      border-radius: 14px;
      box-shadow: 0 10px 24px rgba(2, 6, 23, 0.5);
      padding: 16px;
    }
    .modal-title {
      margin: 0 0 8px;
      color: #dbeafe;
      font-size: 18px;
    }
    .modal-text {
      margin: 0;
      color: #93c5fd;
      line-height: 1.5;
    }
    .modal-actions {
      margin-top: 14px;
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .secondary-btn {
      border-color: #334155;
      background: #1f2937;
    }
    .secondary-btn:hover {
      background: #334155;
    }
    @media (max-width: 900px) {
      body {
        padding: 16px;
      }
      .page {
        max-width: 100%;
      }
      .header-row,
      .header-left {
        align-items: stretch;
      }
      .header-left,
      .header-actions {
        width: 100%;
        flex-wrap: wrap;
      }
      .header-actions > *,
      .controls > * {
        flex: 1 1 220px;
      }
      .summary {
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      }
    }
    @media (max-width: 640px) {
      body {
        padding: 12px;
      }
      .admin-panel {
        width: 100vw;
        max-width: 100vw;
        border-radius: 0;
        padding: 16px 12px 20px;
        transform: translateX(-100%);
      }
      .header-row,
      .header-left,
      .header-actions,
      .controls,
      .modal-actions {
        flex-direction: column;
      }
      .drawer-toggle,
      .action-link,
      button {
        width: 100%;
        justify-content: center;
        text-align: center;
      }
      .summary {
        grid-template-columns: 1fr;
      }
      .table-wrap {
        overflow-x: visible;
      }
      table,
      thead,
      tbody,
      tr,
      th,
      td {
        display: block;
        width: 100%;
      }
      thead {
        display: none;
      }
      table {
        border: none;
        background: transparent;
        box-shadow: none;
      }
      tbody {
        display: grid;
        gap: 12px;
      }
      tr {
        background: #0f172a;
        border: 1px solid #1e3a8a;
        border-radius: 14px;
        overflow: hidden;
        box-shadow: 0 10px 24px rgba(2, 6, 23, 0.5);
      }
      th,
      td {
        padding: 8px;
      }
      td {
        display: grid;
        grid-template-columns: minmax(110px, 42%) minmax(0, 1fr);
        gap: 10px;
        align-items: center;
        border-bottom: 1px solid #1f2937;
      }
      td::before {
        content: attr(data-label);
        color: #93c5fd;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      tbody tr td:last-child {
        border-bottom: none;
      }
      .display-value,
      .edit-field,
      .status-pill,
      .status-select {
        min-width: 0;
      }
      body.editing .edit-field {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div id="adminOverlay" class="admin-overlay"></div>
  <div class="page">
    <div class="dashboard">
      <div class="main-panel">
        <div class="header-row">
          <div class="header-left">
            <button id="adminToggleBtn" class="drawer-toggle" type="button" aria-expanded="false" aria-controls="adminPanel">
              <span class="drawer-toggle-bars"><span></span></span>
              Admin Panel
            </button>
            <h1>Orders</h1>
          </div>
          <div class="header-actions">
            <a class="action-link" href="/business-expenses">Business Expenses</a>
            <a class="action-link" href="/place-order">Place Order</a>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>${headerCells}</tr>
            </thead>
            <tbody id="ordersTableBody">
              ${rows || '<tr><td colspan="100%">No orders found</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="summary">
          <div class="summary-item">
            <div class="summary-label">Total Material Cost</div>
            <div id="totalMaterialCost" class="summary-value">$${totals.totalMaterialCost.toFixed(2)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Total Expected Revenue</div>
            <div id="totalPrice" class="summary-value">$${totals.totalPrice.toFixed(2)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Profit</div>
            <div id="totalProfit" class="summary-value">$${totalProfit.toFixed(2)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Profit Percentage</div>
            <div id="profitPercent" class="summary-value">${profitPercent.toFixed(2)}%</div>
          </div>
        </div>
        <div class="controls">
          <button id="editOrdersBtn" type="button">Edit Orders</button>
          <button id="saveChangesBtn" type="button">Save Changes</button>
        </div>
      </div>
      <aside id="adminPanel" class="admin-panel">
        <h2 class="admin-title">Admin Panel</h2>
        <div class="admin-card">
          <h3>Delete Order</h3>
          <label for="deleteOrderId">Order ID</label>
          <input id="deleteOrderId" type="number" min="1" placeholder="Order ID" />
          <button id="deleteOrderBtn" class="danger-btn" type="button">Delete Order</button>
          <button id="deleteAllOrdersBtn" class="danger-btn" type="button">Delete All Orders</button>
        </div>
        <div class="admin-card">
          <h3>Create Item</h3>
          <label for="newItemName">Item Name</label>
          <input id="newItemName" type="text" placeholder="Item name" />
          <label for="newItemPrice">Price</label>
          <input id="newItemPrice" type="number" step="0.01" min="0" placeholder="0.00" />
          <label for="newItemMaterialPrice">Material Cost</label>
          <input id="newItemMaterialPrice" type="number" step="0.01" min="0" placeholder="0.00" />
          <button id="createItemBtn" type="button">Create Item</button>
        </div>
        <div class="admin-card">
          <h3>Delete Item</h3>
          <label for="deleteItemId">Item</label>
          <select id="deleteItemId">
            ${itemAdminOptions || '<option value="">No items</option>'}
          </select>
          <button id="deleteItemBtn" class="danger-btn" type="button">Delete Item</button>
        </div>
        <div id="adminMessage" class="admin-message"></div>
      </aside>
    </div>
  </div>
  <div id="deleteAllOrdersModal" class="modal-overlay" aria-hidden="true">
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="deleteAllOrdersModalTitle">
      <h2 id="deleteAllOrdersModalTitle" class="modal-title">Delete All Orders?</h2>
      <p class="modal-text">This will permanently remove every order from the homepage table and from <code>orders.json</code>.</p>
      <div class="modal-actions">
        <button id="cancelDeleteAllOrdersBtn" class="secondary-btn" type="button">Cancel</button>
        <form method="post" action="/admin/delete-all-orders">
          <button class="danger-btn" type="submit">Delete Everything</button>
        </form>
      </div>
    </div>
  </div>
  <script>
    const adminToggleBtn = document.getElementById('adminToggleBtn');
    const adminOverlay = document.getElementById('adminOverlay');
    const editOrdersBtn = document.getElementById('editOrdersBtn');
    const saveChangesBtn = document.getElementById('saveChangesBtn');
    const totalMaterialCostEl = document.getElementById('totalMaterialCost');
    const totalPriceEl = document.getElementById('totalPrice');
    const totalProfitEl = document.getElementById('totalProfit');
    const profitPercentEl = document.getElementById('profitPercent');
    const deleteOrderIdInput = document.getElementById('deleteOrderId');
    const deleteOrderBtn = document.getElementById('deleteOrderBtn');
    const deleteAllOrdersBtn = document.getElementById('deleteAllOrdersBtn');
    const deleteAllOrdersModal = document.getElementById('deleteAllOrdersModal');
    const cancelDeleteAllOrdersBtn = document.getElementById('cancelDeleteAllOrdersBtn');
    const newItemNameInput = document.getElementById('newItemName');
    const newItemPriceInput = document.getElementById('newItemPrice');
    const newItemMaterialPriceInput = document.getElementById('newItemMaterialPrice');
    const createItemBtn = document.getElementById('createItemBtn');
    const deleteItemIdSelect = document.getElementById('deleteItemId');
    const deleteItemBtn = document.getElementById('deleteItemBtn');
    const adminMessageEl = document.getElementById('adminMessage');
    const ordersTableBody = document.getElementById('ordersTableBody');
    const tableCategories = ${JSON.stringify(categories)};
    const emptyOrdersRowHtml = '<tr><td colspan="100%">No orders found</td></tr>';
    const getStatusTone = (value) => {
      const normalized = String(value || '').toLowerCase();
      if (normalized === 'delivered') return 'green';
      if (normalized === 'recieved' || normalized === 'printed') return 'yellow';
      return 'neutral';
    };
    const getPaidTone = (value) => (value ? 'green' : 'red');
    const cellLabelByCategory = ${JSON.stringify(cellLabelByCategory)};

    const applyStatusTone = (selectEl) => {
      const tone = selectEl.dataset.field === 'paid'
        ? getPaidTone(String(selectEl.value).toLowerCase() === 'true')
        : getStatusTone(selectEl.value);
      selectEl.classList.remove('status-yellow', 'status-green', 'status-red', 'status-neutral');
      selectEl.classList.add('status-' + tone);
    };

    const escapeHtmlClient = (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const wireStatusToneListeners = () => {
      document.querySelectorAll('select[data-field="status"], select[data-field="paid"]').forEach((selectEl) => {
        applyStatusTone(selectEl);
        selectEl.addEventListener('change', () => applyStatusTone(selectEl));
      });
    };

    const parseMoney = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const recalculateSummary = () => {
      const rows = Array.from(document.querySelectorAll('tbody tr[data-order-index]'));
      let totalPrice = 0;
      let totalMaterialCost = 0;

      rows.forEach((row) => {
        const quantityInput = row.querySelector('input[data-field="quantity"]');
        const quantityDisplay = row.querySelector('span.display-value[data-field="quantity"]');
        const quantity = quantityInput
          ? Number(quantityInput.value) || 0
          : Number(quantityDisplay ? quantityDisplay.textContent : row.dataset.quantity) || 0;
        const priceInput = row.querySelector('input[data-field="price"]');
        const materialInput = row.querySelector('input[data-field="material-price"]');
        const priceDisplay = row.querySelector('span.display-value[data-field="price"]');
        const materialDisplay = row.querySelector('span.display-value[data-field="material-price"]');

        const price = priceInput
          ? parseMoney(priceInput.value)
          : parseMoney(priceDisplay ? priceDisplay.textContent : 0);
        const materialCost = materialInput
          ? parseMoney(materialInput.value)
          : parseMoney(materialDisplay ? materialDisplay.textContent : 0);

        totalPrice += price * quantity;
        totalMaterialCost += materialCost * quantity;
      });

      const totalProfit = totalPrice - totalMaterialCost;
      const profitPercent = totalPrice > 0 ? (totalProfit / totalPrice) * 100 : 0;

      totalMaterialCostEl.textContent = '$' + totalMaterialCost.toFixed(2);
      totalPriceEl.textContent = '$' + totalPrice.toFixed(2);
      totalProfitEl.textContent = '$' + totalProfit.toFixed(2);
      profitPercentEl.textContent = profitPercent.toFixed(2) + '%';
    };

    const wireSummaryInputListeners = () => {
      document.querySelectorAll('input[data-field="price"], input[data-field="material-price"], input[data-field="quantity"]').forEach((inputEl) => {
        inputEl.addEventListener('input', recalculateSummary);
      });
    };

    const buildStatusOptions = (currentStatus) => {
      const statusOptions = ['Recieved', 'Printed', 'Delivered'];
      const normalized = String(currentStatus ?? '').toLowerCase();
      return statusOptions
        .map((option) => {
          const selected = normalized === option.toLowerCase() ? ' selected' : '';
          return '<option value="' + escapeHtmlClient(option) + '"' + selected + '>' + escapeHtmlClient(option) + '</option>';
        })
        .join('');
    };

    const buildPaidOptions = (paid) => {
      const currentValue = Boolean(paid);
      return [
        { label: 'Paid', value: 'true' },
        { label: 'Not Paid', value: 'false' }
      ]
        .map((option) => {
          const selected = currentValue === (option.value === 'true') ? ' selected' : '';
          return '<option value="' + option.value + '"' + selected + '>' + option.label + '</option>';
        })
        .join('');
    };

    const buildOrderRowHtml = (order, index, items) => {
      const itemPosition = Number(order.item) - 1;
      const itemData =
        Number.isInteger(itemPosition) && itemPosition >= 0 && itemPosition < items.length
          ? items[itemPosition]
          : null;
      const itemName = itemData && itemData.name ? itemData.name : 'Unknown Item';
      const itemOptionsHtml = items
        .map((item, itemIndex) => {
          const itemNumber = itemIndex + 1;
          const selected = itemNumber === Number(order.item) ? ' selected' : '';
          return '<option value="' + itemNumber + '"' + selected + '>' + escapeHtmlClient(item.name ?? ('Item ' + itemNumber)) + '</option>';
        })
        .join('');

      const cells = tableCategories.map((category) => {
        if (category === 'status') {
          const tone = getStatusTone(order.status);
          return [
            '<td data-label="' + escapeHtmlClient(cellLabelByCategory[category] || category) + '">',
            '<span class="display-value status-pill status-' + tone + '" data-field="status">' + escapeHtmlClient(order.status ?? '') + '</span>',
            '<select class="edit-field status-select status-' + tone + '" data-field="status">' + buildStatusOptions(order.status) + '</select>',
            '</td>'
          ].join('');
        }
        if (category === 'paid') {
          const tone = getPaidTone(Boolean(order.paid));
          return [
            '<td data-label="' + escapeHtmlClient(cellLabelByCategory[category] || category) + '">',
            '<span class="display-value status-pill status-' + tone + '" data-field="paid">' + (order.paid ? 'Paid' : 'Not Paid') + '</span>',
            '<select class="edit-field status-select status-' + tone + '" data-field="paid">' + buildPaidOptions(order.paid) + '</select>',
            '</td>'
          ].join('');
        }
        if (category === 'price') {
          const priceValue = order.price ?? '';
          return [
            '<td data-label="' + escapeHtmlClient(cellLabelByCategory[category] || category) + '">',
            '<span class="display-value" data-field="price">' + escapeHtmlClient(priceValue) + '</span>',
            '<input class="edit-field" data-field="price" type="number" step="0.01" value="' + escapeHtmlClient(priceValue) + '" />',
            '</td>'
          ].join('');
        }
        if (category === 'material_cost') {
          const materialValue = order.material_cost ?? '';
          return [
            '<td data-label="' + escapeHtmlClient(cellLabelByCategory[category] || category) + '">',
            '<span class="display-value" data-field="material-price">' + escapeHtmlClient(materialValue) + '</span>',
            '<input class="edit-field" data-field="material-price" type="number" step="0.01" value="' + escapeHtmlClient(materialValue) + '" />',
            '</td>'
          ].join('');
        }
        if (category === 'item') {
          return [
            '<td data-label="' + escapeHtmlClient(cellLabelByCategory[category] || category) + '">',
            '<span class="display-value" data-field="item">' + escapeHtmlClient(itemName) + '</span>',
            '<select class="edit-field" data-field="item">' + itemOptionsHtml + '</select>',
            '</td>'
          ].join('');
        }
        if (category === 'customer') {
          const customerValue = order.customer ?? '';
          return [
            '<td data-label="' + escapeHtmlClient(cellLabelByCategory[category] || category) + '">',
            '<span class="display-value" data-field="customer">' + escapeHtmlClient(customerValue) + '</span>',
            '<input class="edit-field" data-field="customer" type="text" value="' + escapeHtmlClient(customerValue) + '" />',
            '</td>'
          ].join('');
        }
        if (category === 'quantity') {
          const quantityValue = order.quantity ?? '';
          return [
            '<td data-label="' + escapeHtmlClient(cellLabelByCategory[category] || category) + '">',
            '<span class="display-value" data-field="quantity">' + escapeHtmlClient(quantityValue) + '</span>',
            '<input class="edit-field" data-field="quantity" type="number" min="1" step="1" value="' + escapeHtmlClient(quantityValue) + '" />',
            '</td>'
          ].join('');
        }
        return '<td data-label="' + escapeHtmlClient(cellLabelByCategory[category] || category) + '">' + escapeHtmlClient(order[category]) + '</td>';
      }).join('');

      return '<tr data-order-index="' + index + '" data-quantity="' + escapeHtmlClient(order.quantity ?? 0) + '"><td data-label="ID">' + (index + 1) + '</td>' + cells + '</tr>';
    };

    const updateAdminItemOptions = (items) => {
      const optionsHtml = items
        .map((item, index) => '<option value="' + (index + 1) + '">#' + (index + 1) + ' - ' + escapeHtmlClient(item.name ?? ('Item ' + (index + 1))) + '</option>')
        .join('');
      deleteItemIdSelect.innerHTML = optionsHtml || '<option value="">No items</option>';
    };

    const renderLiveOrders = (orders, items) => {
      if (!Array.isArray(orders) || !Array.isArray(items)) {
        return;
      }
      if (tableCategories.length === 0 && orders.length > 0) {
        window.location.reload();
        return;
      }
      ordersTableBody.innerHTML = orders.length
        ? orders.map((order, index) => buildOrderRowHtml(order, index, items)).join('')
        : emptyOrdersRowHtml;
      wireStatusToneListeners();
      wireSummaryInputListeners();
      recalculateSummary();
      updateAdminItemOptions(items);
    };

    const refreshOrdersLive = async () => {
      if (document.body.classList.contains('editing')) {
        return;
      }
      try {
        const response = await fetch('/api/orders');
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        renderLiveOrders(data.orders || [], data.items || []);
      } catch (error) {
        // Keep current view if refresh fails.
      }
    };

    wireStatusToneListeners();
    wireSummaryInputListeners();
    recalculateSummary();
    setInterval(refreshOrdersLive, 3000);

    const setAdminMessage = (message, isError = false) => {
      adminMessageEl.textContent = message;
      adminMessageEl.style.color = isError ? '#fca5a5' : '#93c5fd';
    };

    const postJson = async (url, body) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      let data = null;
      try {
        data = await response.json();
      } catch (error) {
        data = null;
      }
      if (!response.ok) {
        throw new Error((data && data.error) ? data.error : 'Request failed');
      }
      return data;
    };

    const setAdminDrawerOpen = (isOpen) => {
      document.body.classList.toggle('admin-open', isOpen);
      adminToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    };

    const setDeleteAllOrdersModalOpen = (isOpen) => {
      deleteAllOrdersModal.classList.toggle('open', isOpen);
      deleteAllOrdersModal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    };

    adminToggleBtn.addEventListener('click', () => {
      setAdminDrawerOpen(!document.body.classList.contains('admin-open'));
    });

    adminOverlay.addEventListener('click', () => {
      setAdminDrawerOpen(false);
    });

    deleteAllOrdersBtn.addEventListener('click', () => {
      setDeleteAllOrdersModalOpen(true);
    });

    cancelDeleteAllOrdersBtn.addEventListener('click', () => {
      setDeleteAllOrdersModalOpen(false);
    });

    deleteAllOrdersModal.addEventListener('click', (event) => {
      if (event.target === deleteAllOrdersModal) {
        setDeleteAllOrdersModalOpen(false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setAdminDrawerOpen(false);
        setDeleteAllOrdersModalOpen(false);
      }
    });

    editOrdersBtn.addEventListener('click', () => {
      document.body.classList.add('editing');
    });

    saveChangesBtn.addEventListener('click', async () => {
      const rows = Array.from(document.querySelectorAll('tbody tr[data-order-index]'));
      const orderUpdates = rows.map((row) => {
        const customerInput = row.querySelector('input[data-field="customer"]');
        const itemSelect = row.querySelector('select[data-field="item"]');
        const quantityInput = row.querySelector('input[data-field="quantity"]');
        const statusSelect = row.querySelector('select[data-field="status"]');
        const paidSelect = row.querySelector('select[data-field="paid"]');
        const priceInput = row.querySelector('input[data-field="price"]');
        const materialPriceInput = row.querySelector('input[data-field="material-price"]');

        return {
          orderIndex: Number(row.dataset.orderIndex),
          customer: customerInput ? customerInput.value : '',
          item: itemSelect ? itemSelect.value : '',
          quantity: quantityInput ? quantityInput.value : '',
          status: statusSelect ? statusSelect.value : '',
          paid: paidSelect ? paidSelect.value : 'false',
          price: priceInput ? priceInput.value : '',
          materialPrice: materialPriceInput ? materialPriceInput.value : ''
        };
      });

      const response = await fetch('/save-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderUpdates })
      });

      if (!response.ok) {
        alert('Unable to save changes.');
        return;
      }

      window.location.reload();
    });

    deleteOrderBtn.addEventListener('click', async () => {
      const orderId = Number(deleteOrderIdInput.value);
      if (!Number.isInteger(orderId) || orderId < 1) {
        setAdminMessage('Enter a valid order ID.', true);
        return;
      }
      try {
        await postJson('/admin/delete-order', { orderId });
        setAdminMessage('Order deleted. Refreshing...');
        window.location.reload();
      } catch (error) {
        setAdminMessage(error.message, true);
      }
    });

    createItemBtn.addEventListener('click', async () => {
      const name = newItemNameInput.value.trim();
      const price = Number(newItemPriceInput.value);
      const materialPrice = Number(newItemMaterialPriceInput.value);
      if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(materialPrice) || materialPrice < 0) {
        setAdminMessage('Enter valid item values.', true);
        return;
      }
      try {
        await postJson('/admin/create-item', { name, price, materialPrice });
        setAdminMessage('Item created. Refreshing...');
        window.location.reload();
      } catch (error) {
        setAdminMessage(error.message, true);
      }
    });

    deleteItemBtn.addEventListener('click', async () => {
      const itemId = Number(deleteItemIdSelect.value);
      if (!Number.isInteger(itemId) || itemId < 1) {
        setAdminMessage('Select a valid item.', true);
        return;
      }
      try {
        await postJson('/admin/delete-item', { itemId });
        setAdminMessage('Item deleted. Refreshing...');
        window.location.reload();
      } catch (error) {
        setAdminMessage(error.message, true);
      }
    });
  </script>
</body>
</html>`;

  res.send(html);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});