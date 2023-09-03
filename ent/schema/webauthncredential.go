package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/mixin"
	"github.com/duo-labs/webauthn/webauthn"
)

// WebauthnCredential holds the schema definition for the WebauthnCredential entity.
type WebauthnCredential struct {
	ent.Schema
}

// Fields of the WebauthnCredential.
func (WebauthnCredential) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").NotEmpty(),
		field.JSON("credential", webauthn.Credential{}),
	}
}

// Edges of the WebauthnCredential.
func (WebauthnCredential) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("user", User.Type).Ref("authncredentials").
			Unique().Required(),
	}
}

func (WebauthnCredential) Mixin() []ent.Mixin {
	return []ent.Mixin{
		mixin.Time{},
	}
}
