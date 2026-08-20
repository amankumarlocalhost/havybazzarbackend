const {
  calculateEmdAmountPaise,
  validateBidAmount,
  resolveAuctionState,
  isWithinExtensionWindow,
  computeExtendedEndTime,
  canExtend,
} = require('../src/utils/auctionMath');

describe('calculateEmdAmountPaise', () => {
  test('2% (200 bps) sahi calculate hota hai', () => {
    expect(calculateEmdAmountPaise(100000000, 200)).toBe(2000000); // ₹10,00,000 ka 2% = ₹20,000
  });

  test('1% (100 bps) sahi calculate hota hai', () => {
    expect(calculateEmdAmountPaise(100000000, 100)).toBe(1000000); // ₹10,000
  });

  test('rounding sahi hoti hai (paise me fraction nahi rehta)', () => {
    expect(Number.isInteger(calculateEmdAmountPaise(333333, 200))).toBe(true);
  });
});

describe('validateBidAmount', () => {
  test('pehla bid starting bid se kam nahi ho sakta', () => {
    const result = validateBidAmount({
      bidAmountPaise: 900000,
      currentHighestPaise: null,
      minIncrementPaise: 10000,
      startingBidPaise: 1000000,
    });
    expect(result.valid).toBe(false);
    expect(result.minRequiredPaise).toBe(1000000);
  });

  test('pehla bid starting bid ke barabar accept hota hai', () => {
    const result = validateBidAmount({
      bidAmountPaise: 1000000,
      currentHighestPaise: null,
      minIncrementPaise: 10000,
      startingBidPaise: 1000000,
    });
    expect(result.valid).toBe(true);
  });

  test('doosra bid current highest + increment se kam reject hota hai', () => {
    const result = validateBidAmount({
      bidAmountPaise: 1005000,
      currentHighestPaise: 1000000,
      minIncrementPaise: 10000,
      startingBidPaise: 1000000,
    });
    expect(result.valid).toBe(false);
    expect(result.minRequiredPaise).toBe(1010000);
  });

  test('sahi increment wala bid accept hota hai', () => {
    const result = validateBidAmount({
      bidAmountPaise: 1010000,
      currentHighestPaise: 1000000,
      minIncrementPaise: 10000,
      startingBidPaise: 1000000,
    });
    expect(result.valid).toBe(true);
  });
});

describe('resolveAuctionState — auto-bid (proxy bidding) engine', () => {
  test('koi bidder na ho to null state', () => {
    const result = resolveAuctionState({
      startingBidPaise: 1000000,
      minIncrementPaise: 10000,
      activeMaxBids: [],
    });
    expect(result).toEqual({ leaderId: null, currentPricePaise: null });
  });

  test('sirf ek bidder ho to price starting bid pe rehta hai', () => {
    const result = resolveAuctionState({
      startingBidPaise: 1000000,
      minIncrementPaise: 10000,
      activeMaxBids: [{ bidderId: 'A', maxAmountPaise: 5000000 }], // A ka max bahut zyada hai
    });
    // Koi competition nahi, isliye A apna poora max nahi dega —
    // price starting bid pe hi rukega
    expect(result).toEqual({ leaderId: 'A', currentPricePaise: 1000000 });
  });

  test('do bidders: zyada max wala jeetega, sirf doosre ke max+increment tak', () => {
    const result = resolveAuctionState({
      startingBidPaise: 1000000,
      minIncrementPaise: 10000,
      activeMaxBids: [
        { bidderId: 'A', maxAmountPaise: 1500000 },
        { bidderId: 'B', maxAmountPaise: 1200000 },
      ],
    });
    // A jeetega, par sirf B ke max (1200000) + increment (10000) tak —
    // apne poore 1500000 tak nahi
    expect(result).toEqual({ leaderId: 'A', currentPricePaise: 1210000 });
  });

  test('bada max gap ho tab bhi EK hi step me resolve hota hai (bug fix)', () => {
    // Purane buggy version me ye sainkdon iterations leta (increment chhota, gap bada)
    const result = resolveAuctionState({
      startingBidPaise: 10000,
      minIncrementPaise: 1000,
      activeMaxBids: [
        { bidderId: 'A', maxAmountPaise: 50000 },
        { bidderId: 'B', maxAmountPaise: 700000 }, // A se bahut zyada
        { bidderId: 'C', maxAmountPaise: 60000 },
      ],
    });
    // B jeetega (sabse zyada max), sirf doosre-sabse-zyada (C: 60000) + increment tak
    expect(result).toEqual({ leaderId: 'B', currentPricePaise: 61000 });
  });

  test('price top1 ke max se zyada kabhi nahi hoti (cap)', () => {
    const result = resolveAuctionState({
      startingBidPaise: 1000000,
      minIncrementPaise: 100000, // bada increment
      activeMaxBids: [
        { bidderId: 'A', maxAmountPaise: 1200000 },
        { bidderId: 'B', maxAmountPaise: 1150000 },
      ],
    });
    // B(1150000) + increment(100000) = 1250000, jo A ke max (1200000) se zyada hai
    // isliye price A ke max pe CAP ho jaani chahiye
    expect(result.currentPricePaise).toBe(1200000);
    expect(result.leaderId).toBe('A');
  });

  test('equal max ho to jo PEHLE bid kiya wahi jeetega (tie-break)', () => {
    const result = resolveAuctionState({
      startingBidPaise: 1000000,
      minIncrementPaise: 10000,
      activeMaxBids: [
        { bidderId: 'A', maxAmountPaise: 1500000 }, // pehle aaya
        { bidderId: 'B', maxAmountPaise: 1500000 }, // baad me aaya, same max
      ],
    });
    expect(result.leaderId).toBe('A');
    expect(result.currentPricePaise).toBe(1500000); // dono max barabar, poora max hi price banega
  });

  test('teen bidders me sabse strong 2 hi price decide karte hain', () => {
    const result = resolveAuctionState({
      startingBidPaise: 100000,
      minIncrementPaise: 5000,
      activeMaxBids: [
        { bidderId: 'A', maxAmountPaise: 300000 },
        { bidderId: 'B', maxAmountPaise: 500000 },
        { bidderId: 'C', maxAmountPaise: 200000 }, // sabse kamzor, koi asar nahi
      ],
    });
    expect(result.leaderId).toBe('B');
    expect(result.currentPricePaise).toBe(305000); // A ke max(300000) + increment(5000)
  });
});

describe('isWithinExtensionWindow', () => {
  test('end time se 3 minute pehle bid aayi (5 min window) -> true', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const endTime = new Date('2026-01-01T10:03:00Z');
    expect(isWithinExtensionWindow(endTime, now, 5)).toBe(true);
  });

  test('end time se 10 minute pehle bid aayi (5 min window) -> false', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const endTime = new Date('2026-01-01T10:10:00Z');
    expect(isWithinExtensionWindow(endTime, now, 5)).toBe(false);
  });

  test('auction already khatam ho chuka -> false', () => {
    const now = new Date('2026-01-01T10:05:00Z');
    const endTime = new Date('2026-01-01T10:00:00Z');
    expect(isWithinExtensionWindow(endTime, now, 5)).toBe(false);
  });
});

describe('computeExtendedEndTime', () => {
  test('5 minute add hote hain', () => {
    const endTime = new Date('2026-01-01T10:00:00Z');
    const result = computeExtendedEndTime(endTime, 5);
    expect(result.toISOString()).toBe('2026-01-01T10:05:00.000Z');
  });
});

describe('canExtend', () => {
  test('max extensions paar hone pe false', () => {
    const result = canExtend({
      extensionCount: 5,
      maxExtensions: 5,
      startTime: new Date('2026-01-01T00:00:00Z'),
      proposedNewEndTime: new Date('2026-01-02T00:00:00Z'),
      maxTotalDays: 15,
    });
    expect(result).toBe(false);
  });

  test('max total days paar hone pe false', () => {
    const result = canExtend({
      extensionCount: 1,
      maxExtensions: 5,
      startTime: new Date('2026-01-01T00:00:00Z'),
      proposedNewEndTime: new Date('2026-01-20T00:00:00Z'), // 19 din, max 15
      maxTotalDays: 15,
    });
    expect(result).toBe(false);
  });

  test('dono limits ke andar true', () => {
    const result = canExtend({
      extensionCount: 1,
      maxExtensions: 5,
      startTime: new Date('2026-01-01T00:00:00Z'),
      proposedNewEndTime: new Date('2026-01-05T00:00:00Z'),
      maxTotalDays: 15,
    });
    expect(result).toBe(true);
  });
});
