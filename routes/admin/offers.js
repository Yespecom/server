const express = require("express")
const router = express.Router()
const { getTenantDB } = require("../../config/tenantDB")
const Offer = require("../../models/tenant/Offer") // Offer model factory

// Middleware to ensure tenantDB is available
router.use((req, res, next) => {
  if (!req.tenantDB) {
    return res.status(500).json({ error: "Tenant database connection not established." })
  }
  next()
})

// Get all offers
router.get("/", async (req, res) => {
  try {
    const OfferModel = Offer(req.tenantDB)
    const offers = await OfferModel.find({})
    res.status(200).json(offers)
  } catch (error) {
    console.error("❌ Error fetching offers:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Get offer by ID
router.get("/:id", async (req, res) => {
  try {
    const OfferModel = Offer(req.tenantDB)
    const offer = await OfferModel.findById(req.params.id)
    if (!offer) {
      return res.status(404).json({ error: "Offer not found." })
    }
    res.status(200).json(offer)
  } catch (error) {
    console.error("❌ Error fetching offer by ID:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Create a new offer
router.post("/", async (req, res) => {
  try {
    const OfferModel = Offer(req.tenantDB)
    const newOffer = new OfferModel(req.body)
    await newOffer.save()
    res.status(201).json(newOffer)
  } catch (error) {
    console.error("❌ Error creating offer:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Update an offer by ID
router.put("/:id", async (req, res) => {
  try {
    const OfferModel = Offer(req.tenantDB)
    const updatedOffer = await OfferModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    if (!updatedOffer) {
      return res.status(404).json({ error: "Offer not found." })
    }
    res.status(200).json(updatedOffer)
  } catch (error) {
    console.error("❌ Error updating offer:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

// Delete an offer by ID
router.delete("/:id", async (req, res) => {
  try {
    const OfferModel = Offer(req.tenantDB)
    const deletedOffer = await OfferModel.findByIdAndDelete(req.params.id)
    if (!deletedOffer) {
      return res.status(404).json({ error: "Offer not found." })
    }
    res.status(200).json({ message: "Offer deleted successfully." })
  } catch (error) {
    console.error("❌ Error deleting offer:", error)
    res.status(500).json({ error: "Internal server error." })
  }
})

module.exports = router
