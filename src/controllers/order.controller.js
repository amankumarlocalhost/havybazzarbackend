const orderService = require('../services/order.service');
const invoiceService = require('../services/invoice.service');
const catchAsync = require('../utils/catchAsync');

exports.getMyOrders = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await orderService.getMyOrders(req.user.userId, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  res.status(200).json({ success: true, data: result });
});

exports.getSellerOrders = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await orderService.getSellerOrders(req.user.userId, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  res.status(200).json({ success: true, data: result });
});

exports.generateInvoice = catchAsync(async (req, res) => {
  const order = await orderService.generateInvoice(req.params.orderId, req.user.userId);
  res.status(200).json({ success: true, data: order });
});

exports.downloadInvoice = catchAsync(async (req, res) => {
  const order = await orderService.getOrderForInvoice(req.params.orderId, req.user.userId);
  invoiceService.streamInvoicePdf(order, res);
});

exports.adminListOrders = catchAsync(async (req, res) => {
  const { status, page, limit } = req.query;
  const result = await orderService.adminListOrders({
    status,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  res.status(200).json({ success: true, data: result });
});

exports.adminUpdateStatus = catchAsync(async (req, res) => {
  const order = await orderService.updateOrderStatus(req.params.orderId, req.body.status, req.admin);
  res.status(200).json({ success: true, message: 'Order status updated successfully', data: order });
});
