const categoryService = require('../services/category.service');
const catchAsync = require('../utils/catchAsync');

exports.listPublic = catchAsync(async (req, res) => {
  const categories = await categoryService.listPublicCategories();
  res.status(200).json({ success: true, data: categories });
});

exports.adminList = catchAsync(async (req, res) => {
  const categories = await categoryService.adminListCategories();
  res.status(200).json({ success: true, data: categories });
});

exports.create = catchAsync(async (req, res) => {
  const category = await categoryService.createCategory(req.body, req.admin);
  res.status(201).json({ success: true, message: 'Category created successfully', data: category });
});

exports.update = catchAsync(async (req, res) => {
  const category = await categoryService.updateCategory(req.params.categoryId, req.body, req.admin);
  res.status(200).json({ success: true, message: 'Category updated successfully', data: category });
});

exports.remove = catchAsync(async (req, res) => {
  const result = await categoryService.deleteCategory(req.params.categoryId, req.admin);
  res.status(200).json({
    success: true,
    message: result.deactivatedOnly
      ? `Category has linked listings, so it was deactivated instead of deleted`
      : 'Category deleted successfully',
    data: result,
  });
});
