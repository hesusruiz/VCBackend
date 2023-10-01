// Code generated by ent, DO NOT EDIT.

package ent

import (
	"context"
	"errors"
	"fmt"
	"time"

	"entgo.io/ent/dialect/sql/sqlgraph"
	"entgo.io/ent/schema/field"
	"github.com/duo-labs/webauthn/webauthn"
	"github.com/evidenceledger/vcdemo/ent/user"
	"github.com/evidenceledger/vcdemo/ent/webauthncredential"
)

// WebauthnCredentialCreate is the builder for creating a WebauthnCredential entity.
type WebauthnCredentialCreate struct {
	config
	mutation *WebauthnCredentialMutation
	hooks    []Hook
}

// SetCreateTime sets the "create_time" field.
func (wcc *WebauthnCredentialCreate) SetCreateTime(t time.Time) *WebauthnCredentialCreate {
	wcc.mutation.SetCreateTime(t)
	return wcc
}

// SetNillableCreateTime sets the "create_time" field if the given value is not nil.
func (wcc *WebauthnCredentialCreate) SetNillableCreateTime(t *time.Time) *WebauthnCredentialCreate {
	if t != nil {
		wcc.SetCreateTime(*t)
	}
	return wcc
}

// SetUpdateTime sets the "update_time" field.
func (wcc *WebauthnCredentialCreate) SetUpdateTime(t time.Time) *WebauthnCredentialCreate {
	wcc.mutation.SetUpdateTime(t)
	return wcc
}

// SetNillableUpdateTime sets the "update_time" field if the given value is not nil.
func (wcc *WebauthnCredentialCreate) SetNillableUpdateTime(t *time.Time) *WebauthnCredentialCreate {
	if t != nil {
		wcc.SetUpdateTime(*t)
	}
	return wcc
}

// SetCredential sets the "credential" field.
func (wcc *WebauthnCredentialCreate) SetCredential(w webauthn.Credential) *WebauthnCredentialCreate {
	wcc.mutation.SetCredential(w)
	return wcc
}

// SetID sets the "id" field.
func (wcc *WebauthnCredentialCreate) SetID(s string) *WebauthnCredentialCreate {
	wcc.mutation.SetID(s)
	return wcc
}

// SetUserID sets the "user" edge to the User entity by ID.
func (wcc *WebauthnCredentialCreate) SetUserID(id string) *WebauthnCredentialCreate {
	wcc.mutation.SetUserID(id)
	return wcc
}

// SetUser sets the "user" edge to the User entity.
func (wcc *WebauthnCredentialCreate) SetUser(u *User) *WebauthnCredentialCreate {
	return wcc.SetUserID(u.ID)
}

// Mutation returns the WebauthnCredentialMutation object of the builder.
func (wcc *WebauthnCredentialCreate) Mutation() *WebauthnCredentialMutation {
	return wcc.mutation
}

// Save creates the WebauthnCredential in the database.
func (wcc *WebauthnCredentialCreate) Save(ctx context.Context) (*WebauthnCredential, error) {
	var (
		err  error
		node *WebauthnCredential
	)
	wcc.defaults()
	if len(wcc.hooks) == 0 {
		if err = wcc.check(); err != nil {
			return nil, err
		}
		node, err = wcc.sqlSave(ctx)
	} else {
		var mut Mutator = MutateFunc(func(ctx context.Context, m Mutation) (Value, error) {
			mutation, ok := m.(*WebauthnCredentialMutation)
			if !ok {
				return nil, fmt.Errorf("unexpected mutation type %T", m)
			}
			if err = wcc.check(); err != nil {
				return nil, err
			}
			wcc.mutation = mutation
			if node, err = wcc.sqlSave(ctx); err != nil {
				return nil, err
			}
			mutation.id = &node.ID
			mutation.done = true
			return node, err
		})
		for i := len(wcc.hooks) - 1; i >= 0; i-- {
			if wcc.hooks[i] == nil {
				return nil, fmt.Errorf("ent: uninitialized hook (forgotten import ent/runtime?)")
			}
			mut = wcc.hooks[i](mut)
		}
		v, err := mut.Mutate(ctx, wcc.mutation)
		if err != nil {
			return nil, err
		}
		nv, ok := v.(*WebauthnCredential)
		if !ok {
			return nil, fmt.Errorf("unexpected node type %T returned from WebauthnCredentialMutation", v)
		}
		node = nv
	}
	return node, err
}

// SaveX calls Save and panics if Save returns an error.
func (wcc *WebauthnCredentialCreate) SaveX(ctx context.Context) *WebauthnCredential {
	v, err := wcc.Save(ctx)
	if err != nil {
		panic(err)
	}
	return v
}

// Exec executes the query.
func (wcc *WebauthnCredentialCreate) Exec(ctx context.Context) error {
	_, err := wcc.Save(ctx)
	return err
}

// ExecX is like Exec, but panics if an error occurs.
func (wcc *WebauthnCredentialCreate) ExecX(ctx context.Context) {
	if err := wcc.Exec(ctx); err != nil {
		panic(err)
	}
}

// defaults sets the default values of the builder before save.
func (wcc *WebauthnCredentialCreate) defaults() {
	if _, ok := wcc.mutation.CreateTime(); !ok {
		v := webauthncredential.DefaultCreateTime()
		wcc.mutation.SetCreateTime(v)
	}
	if _, ok := wcc.mutation.UpdateTime(); !ok {
		v := webauthncredential.DefaultUpdateTime()
		wcc.mutation.SetUpdateTime(v)
	}
}

// check runs all checks and user-defined validators on the builder.
func (wcc *WebauthnCredentialCreate) check() error {
	if _, ok := wcc.mutation.CreateTime(); !ok {
		return &ValidationError{Name: "create_time", err: errors.New(`ent: missing required field "WebauthnCredential.create_time"`)}
	}
	if _, ok := wcc.mutation.UpdateTime(); !ok {
		return &ValidationError{Name: "update_time", err: errors.New(`ent: missing required field "WebauthnCredential.update_time"`)}
	}
	if _, ok := wcc.mutation.Credential(); !ok {
		return &ValidationError{Name: "credential", err: errors.New(`ent: missing required field "WebauthnCredential.credential"`)}
	}
	if v, ok := wcc.mutation.ID(); ok {
		if err := webauthncredential.IDValidator(v); err != nil {
			return &ValidationError{Name: "id", err: fmt.Errorf(`ent: validator failed for field "WebauthnCredential.id": %w`, err)}
		}
	}
	if _, ok := wcc.mutation.UserID(); !ok {
		return &ValidationError{Name: "user", err: errors.New(`ent: missing required edge "WebauthnCredential.user"`)}
	}
	return nil
}

func (wcc *WebauthnCredentialCreate) sqlSave(ctx context.Context) (*WebauthnCredential, error) {
	_node, _spec := wcc.createSpec()
	if err := sqlgraph.CreateNode(ctx, wcc.driver, _spec); err != nil {
		if sqlgraph.IsConstraintError(err) {
			err = &ConstraintError{msg: err.Error(), wrap: err}
		}
		return nil, err
	}
	if _spec.ID.Value != nil {
		if id, ok := _spec.ID.Value.(string); ok {
			_node.ID = id
		} else {
			return nil, fmt.Errorf("unexpected WebauthnCredential.ID type: %T", _spec.ID.Value)
		}
	}
	return _node, nil
}

func (wcc *WebauthnCredentialCreate) createSpec() (*WebauthnCredential, *sqlgraph.CreateSpec) {
	var (
		_node = &WebauthnCredential{config: wcc.config}
		_spec = &sqlgraph.CreateSpec{
			Table: webauthncredential.Table,
			ID: &sqlgraph.FieldSpec{
				Type:   field.TypeString,
				Column: webauthncredential.FieldID,
			},
		}
	)
	if id, ok := wcc.mutation.ID(); ok {
		_node.ID = id
		_spec.ID.Value = id
	}
	if value, ok := wcc.mutation.CreateTime(); ok {
		_spec.Fields = append(_spec.Fields, &sqlgraph.FieldSpec{
			Type:   field.TypeTime,
			Value:  value,
			Column: webauthncredential.FieldCreateTime,
		})
		_node.CreateTime = value
	}
	if value, ok := wcc.mutation.UpdateTime(); ok {
		_spec.Fields = append(_spec.Fields, &sqlgraph.FieldSpec{
			Type:   field.TypeTime,
			Value:  value,
			Column: webauthncredential.FieldUpdateTime,
		})
		_node.UpdateTime = value
	}
	if value, ok := wcc.mutation.Credential(); ok {
		_spec.Fields = append(_spec.Fields, &sqlgraph.FieldSpec{
			Type:   field.TypeJSON,
			Value:  value,
			Column: webauthncredential.FieldCredential,
		})
		_node.Credential = value
	}
	if nodes := wcc.mutation.UserIDs(); len(nodes) > 0 {
		edge := &sqlgraph.EdgeSpec{
			Rel:     sqlgraph.M2O,
			Inverse: true,
			Table:   webauthncredential.UserTable,
			Columns: []string{webauthncredential.UserColumn},
			Bidi:    false,
			Target: &sqlgraph.EdgeTarget{
				IDSpec: &sqlgraph.FieldSpec{
					Type:   field.TypeString,
					Column: user.FieldID,
				},
			},
		}
		for _, k := range nodes {
			edge.Target.Nodes = append(edge.Target.Nodes, k)
		}
		_node.user_authncredentials = &nodes[0]
		_spec.Edges = append(_spec.Edges, edge)
	}
	return _node, _spec
}

// WebauthnCredentialCreateBulk is the builder for creating many WebauthnCredential entities in bulk.
type WebauthnCredentialCreateBulk struct {
	config
	builders []*WebauthnCredentialCreate
}

// Save creates the WebauthnCredential entities in the database.
func (wccb *WebauthnCredentialCreateBulk) Save(ctx context.Context) ([]*WebauthnCredential, error) {
	specs := make([]*sqlgraph.CreateSpec, len(wccb.builders))
	nodes := make([]*WebauthnCredential, len(wccb.builders))
	mutators := make([]Mutator, len(wccb.builders))
	for i := range wccb.builders {
		func(i int, root context.Context) {
			builder := wccb.builders[i]
			builder.defaults()
			var mut Mutator = MutateFunc(func(ctx context.Context, m Mutation) (Value, error) {
				mutation, ok := m.(*WebauthnCredentialMutation)
				if !ok {
					return nil, fmt.Errorf("unexpected mutation type %T", m)
				}
				if err := builder.check(); err != nil {
					return nil, err
				}
				builder.mutation = mutation
				nodes[i], specs[i] = builder.createSpec()
				var err error
				if i < len(mutators)-1 {
					_, err = mutators[i+1].Mutate(root, wccb.builders[i+1].mutation)
				} else {
					spec := &sqlgraph.BatchCreateSpec{Nodes: specs}
					// Invoke the actual operation on the latest mutation in the chain.
					if err = sqlgraph.BatchCreate(ctx, wccb.driver, spec); err != nil {
						if sqlgraph.IsConstraintError(err) {
							err = &ConstraintError{msg: err.Error(), wrap: err}
						}
					}
				}
				if err != nil {
					return nil, err
				}
				mutation.id = &nodes[i].ID
				mutation.done = true
				return nodes[i], nil
			})
			for i := len(builder.hooks) - 1; i >= 0; i-- {
				mut = builder.hooks[i](mut)
			}
			mutators[i] = mut
		}(i, ctx)
	}
	if len(mutators) > 0 {
		if _, err := mutators[0].Mutate(ctx, wccb.builders[0].mutation); err != nil {
			return nil, err
		}
	}
	return nodes, nil
}

// SaveX is like Save, but panics if an error occurs.
func (wccb *WebauthnCredentialCreateBulk) SaveX(ctx context.Context) []*WebauthnCredential {
	v, err := wccb.Save(ctx)
	if err != nil {
		panic(err)
	}
	return v
}

// Exec executes the query.
func (wccb *WebauthnCredentialCreateBulk) Exec(ctx context.Context) error {
	_, err := wccb.Save(ctx)
	return err
}

// ExecX is like Exec, but panics if an error occurs.
func (wccb *WebauthnCredentialCreateBulk) ExecX(ctx context.Context) {
	if err := wccb.Exec(ctx); err != nil {
		panic(err)
	}
}
