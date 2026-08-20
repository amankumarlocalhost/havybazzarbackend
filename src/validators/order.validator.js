const { z } = require('zod');
const { ORDER_STATUS } = require('../constants/enums');

const updateOrderStatusSchema = z.object({
  status: z.enum(Object.values(ORDER_STATUS)),
});

module.exports = { updateOrderStatusSchema };
