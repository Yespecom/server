const express = require("express")
const router = express.Router()

// Assuming req.tenantModels.Offer is available from storeContextMiddleware
// and authMiddleware has already run for admin routes

// Get all offers for the tenant
router.get("/", async (req, res) => {
  try {
    const Offer = req.tenantModels.Offer
    const offers = await Offer.find({})
    res.json(offers)
  } catch (error) {
    console.error("❌ Error fetching offers:", error)
    res.status(500).json({ error: "Failed to fetch offers" })
  }
})

// Get a single offer by ID
router.get("/:id", async (req, res) => {
  try {
    const Offer = req.tenantModels.Offer
    const offer = await Offer.findById(req.params.id)
    if (!offer) {
      return res.status(404).json({ error: "Offer not found" })
    }
    res.json(offer)
  } catch (error) {
    console.error("❌ Error fetching offer by ID:", error)
    res.status(500).json({ error: "Failed to fetch offer" })
  }
})

// Create a new offer
router.post("/", async (req, res) => {
  try {
    const Offer = req.tenantModels.Offer
    const {
      name,
      description,
      discountType,
      discountValue,
      minimumPurchaseAmount,
      startDate,
      endDate,
      isActive,
      appliesTo,
      productIds,
      categoryIds,
      usageLimit,
    } = req.body

    if (!name || !discountType || discountValue === undefined || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing required offer fields" })
    }

    const newOffer = new Offer({
      tenantId: req.user.tenantId, // Assuming tenantId from auth middleware
      name,
      description,
      discountType,
      discountValue,
      minimumPurchaseAmount,
      startDate,
      endDate,
      isActive,
      appliesTo,
      productIds,
      categoryIds,
      usageLimit,
    })
    await newOffer.save()
    res.status(201).json(newOffer)
  } catch (error) {
    console.error("❌ Error creating offer:", error)
    res.status(500).json({ error: "Failed to create offer" })
  }
})

// Update an offer by ID
router.put("/:id", async (req, res) => {
  try {
    const Offer = req.tenantModels.Offer
    const {
      name,
      description,
      discountType,
      discountValue,
      minimumPurchaseAmount,
      startDate,
      endDate,
      isActive,
      appliesTo,
      productIds,
      categoryIds,
      usageLimit,
    } = req.body

    const updatedOffer = await Offer.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description,
        discountType,
        discountValue,
        minimumPurchaseAmount,
        startDate,
        endDate,
        isActive,
        appliesTo,
        productIds,
        categoryIds,
        usageLimit,
      },
      { new: true, runValidators: true },
    )
    if (!updatedOffer) {
      return res.status(404).json({ error: "Offer not found" })
    }
    res.json(updatedOffer)
  } catch (error) {
    console.error("❌ Error updating offer:", error)
    res.status(500).json({ error: "Failed to update offer" })
  }
})

// Delete an offer by ID
router.delete("/:id", async (req, res) => {
  try {
    const Offer = req.tenantModels.Offer
    const deletedOffer = await Offer.findByIdAndDelete(req.params.id)
    if (!deletedOffer) {
      return res.status(404).json({ error: "Offer not found" })
    }
    res.json({ message: "Offer deleted successfully" })
  } catch (error) {
    console.error("❌ Error deleting offer:", error)
    res.status(500).json({ error: "Failed to delete offer" })
  }
})

module.exports = router
