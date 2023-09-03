package util

import (
	"encoding/json"

	"github.com/gofiber/fiber/v2"
)

func PrettyFormatJSON(in []byte) string {
	decoded := &fiber.Map{}
	json.Unmarshal(in, decoded)
	out, _ := json.MarshalIndent(decoded, "", "  ")
	return string(out)
}
