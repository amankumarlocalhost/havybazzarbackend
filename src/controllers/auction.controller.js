const auctionService = require('../services/auction.service');
const catchAsync = require('../utils/catchAsync');

const RUPEES_TO_PAISE = 100;

exports.getDetail = catchAsync(async (req, res) => {
  const result = await auctionService.getAuctionDetail(req.params.auctionId);
  res.status(200).json({ success: true, data: result });
});

exports.placeBid = catchAsync(async (req, res) => {
  const amountPaise = Math.round(req.body.amount * RUPEES_TO_PAISE);
  const auction = await auctionService.placeBid(req.params.auctionId, req.user.userId, amountPaise);
  res.status(200).json({
    success: true,
    message: 'Bid placed successfully',
    data: {
      currentHighestBidPaise: auction.currentHighestBidPaise,
      isLeading: auction.currentLeaderId && auction.currentLeaderId.toString() === req.user.userId,
      endTime: auction.endTime,
    },
  });
});

exports.setAutoBid = catchAsync(async (req, res) => {
  const maxAmountPaise = Math.round(req.body.maxAmount * RUPEES_TO_PAISE);
  const result = await auctionService.setAutoBid(req.params.auctionId, req.user.userId, maxAmountPaise);
  res.status(200).json({
    success: true,
    message: 'Auto-bid set successfully',
    data: {
      currentHighestBidPaise: result.auction.currentHighestBidPaise,
      isLeading: result.isLeading,
    },
  });
});

exports.getMyBids = catchAsync(async (req, res) => {
  const bids = await auctionService.getMyBids(req.user.userId);
  res.status(200).json({ success: true, data: bids });
});

exports.adminList = catchAsync(async (req, res) => {
  const { status, page, limit } = req.query;
  const result = await auctionService.adminListAuctions({
    status,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  res.status(200).json({ success: true, data: result });
});
