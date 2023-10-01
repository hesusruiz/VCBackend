// Code generated by ent, DO NOT EDIT.

package ent

import (
	"context"
	"errors"
	"fmt"
	"time"

	"entgo.io/ent/dialect/sql"
	"entgo.io/ent/dialect/sql/sqlgraph"
	"entgo.io/ent/schema/field"
	"github.com/evidenceledger/vcdemo/ent/predicate"
	"github.com/evidenceledger/vcdemo/ent/privatekey"
	"github.com/evidenceledger/vcdemo/ent/user"
)

// PrivateKeyUpdate is the builder for updating PrivateKey entities.
type PrivateKeyUpdate struct {
	config
	hooks    []Hook
	mutation *PrivateKeyMutation
}

// Where appends a list predicates to the PrivateKeyUpdate builder.
func (pku *PrivateKeyUpdate) Where(ps ...predicate.PrivateKey) *PrivateKeyUpdate {
	pku.mutation.Where(ps...)
	return pku
}

// SetKty sets the "kty" field.
func (pku *PrivateKeyUpdate) SetKty(s string) *PrivateKeyUpdate {
	pku.mutation.SetKty(s)
	return pku
}

// SetAlg sets the "alg" field.
func (pku *PrivateKeyUpdate) SetAlg(s string) *PrivateKeyUpdate {
	pku.mutation.SetAlg(s)
	return pku
}

// SetNillableAlg sets the "alg" field if the given value is not nil.
func (pku *PrivateKeyUpdate) SetNillableAlg(s *string) *PrivateKeyUpdate {
	if s != nil {
		pku.SetAlg(*s)
	}
	return pku
}

// ClearAlg clears the value of the "alg" field.
func (pku *PrivateKeyUpdate) ClearAlg() *PrivateKeyUpdate {
	pku.mutation.ClearAlg()
	return pku
}

// SetJwk sets the "jwk" field.
func (pku *PrivateKeyUpdate) SetJwk(u []uint8) *PrivateKeyUpdate {
	pku.mutation.SetJwk(u)
	return pku
}

// SetUpdatedAt sets the "updated_at" field.
func (pku *PrivateKeyUpdate) SetUpdatedAt(t time.Time) *PrivateKeyUpdate {
	pku.mutation.SetUpdatedAt(t)
	return pku
}

// SetNillableUpdatedAt sets the "updated_at" field if the given value is not nil.
func (pku *PrivateKeyUpdate) SetNillableUpdatedAt(t *time.Time) *PrivateKeyUpdate {
	if t != nil {
		pku.SetUpdatedAt(*t)
	}
	return pku
}

// SetUserID sets the "user" edge to the User entity by ID.
func (pku *PrivateKeyUpdate) SetUserID(id string) *PrivateKeyUpdate {
	pku.mutation.SetUserID(id)
	return pku
}

// SetNillableUserID sets the "user" edge to the User entity by ID if the given value is not nil.
func (pku *PrivateKeyUpdate) SetNillableUserID(id *string) *PrivateKeyUpdate {
	if id != nil {
		pku = pku.SetUserID(*id)
	}
	return pku
}

// SetUser sets the "user" edge to the User entity.
func (pku *PrivateKeyUpdate) SetUser(u *User) *PrivateKeyUpdate {
	return pku.SetUserID(u.ID)
}

// Mutation returns the PrivateKeyMutation object of the builder.
func (pku *PrivateKeyUpdate) Mutation() *PrivateKeyMutation {
	return pku.mutation
}

// ClearUser clears the "user" edge to the User entity.
func (pku *PrivateKeyUpdate) ClearUser() *PrivateKeyUpdate {
	pku.mutation.ClearUser()
	return pku
}

// Save executes the query and returns the number of nodes affected by the update operation.
func (pku *PrivateKeyUpdate) Save(ctx context.Context) (int, error) {
	var (
		err      error
		affected int
	)
	if len(pku.hooks) == 0 {
		affected, err = pku.sqlSave(ctx)
	} else {
		var mut Mutator = MutateFunc(func(ctx context.Context, m Mutation) (Value, error) {
			mutation, ok := m.(*PrivateKeyMutation)
			if !ok {
				return nil, fmt.Errorf("unexpected mutation type %T", m)
			}
			pku.mutation = mutation
			affected, err = pku.sqlSave(ctx)
			mutation.done = true
			return affected, err
		})
		for i := len(pku.hooks) - 1; i >= 0; i-- {
			if pku.hooks[i] == nil {
				return 0, fmt.Errorf("ent: uninitialized hook (forgotten import ent/runtime?)")
			}
			mut = pku.hooks[i](mut)
		}
		if _, err := mut.Mutate(ctx, pku.mutation); err != nil {
			return 0, err
		}
	}
	return affected, err
}

// SaveX is like Save, but panics if an error occurs.
func (pku *PrivateKeyUpdate) SaveX(ctx context.Context) int {
	affected, err := pku.Save(ctx)
	if err != nil {
		panic(err)
	}
	return affected
}

// Exec executes the query.
func (pku *PrivateKeyUpdate) Exec(ctx context.Context) error {
	_, err := pku.Save(ctx)
	return err
}

// ExecX is like Exec, but panics if an error occurs.
func (pku *PrivateKeyUpdate) ExecX(ctx context.Context) {
	if err := pku.Exec(ctx); err != nil {
		panic(err)
	}
}

func (pku *PrivateKeyUpdate) sqlSave(ctx context.Context) (n int, err error) {
	_spec := &sqlgraph.UpdateSpec{
		Node: &sqlgraph.NodeSpec{
			Table:   privatekey.Table,
			Columns: privatekey.Columns,
			ID: &sqlgraph.FieldSpec{
				Type:   field.TypeString,
				Column: privatekey.FieldID,
			},
		},
	}
	if ps := pku.mutation.predicates; len(ps) > 0 {
		_spec.Predicate = func(selector *sql.Selector) {
			for i := range ps {
				ps[i](selector)
			}
		}
	}
	if value, ok := pku.mutation.Kty(); ok {
		_spec.Fields.Set = append(_spec.Fields.Set, &sqlgraph.FieldSpec{
			Type:   field.TypeString,
			Value:  value,
			Column: privatekey.FieldKty,
		})
	}
	if value, ok := pku.mutation.Alg(); ok {
		_spec.Fields.Set = append(_spec.Fields.Set, &sqlgraph.FieldSpec{
			Type:   field.TypeString,
			Value:  value,
			Column: privatekey.FieldAlg,
		})
	}
	if pku.mutation.AlgCleared() {
		_spec.Fields.Clear = append(_spec.Fields.Clear, &sqlgraph.FieldSpec{
			Type:   field.TypeString,
			Column: privatekey.FieldAlg,
		})
	}
	if value, ok := pku.mutation.Jwk(); ok {
		_spec.Fields.Set = append(_spec.Fields.Set, &sqlgraph.FieldSpec{
			Type:   field.TypeJSON,
			Value:  value,
			Column: privatekey.FieldJwk,
		})
	}
	if value, ok := pku.mutation.UpdatedAt(); ok {
		_spec.Fields.Set = append(_spec.Fields.Set, &sqlgraph.FieldSpec{
			Type:   field.TypeTime,
			Value:  value,
			Column: privatekey.FieldUpdatedAt,
		})
	}
	if pku.mutation.UserCleared() {
		edge := &sqlgraph.EdgeSpec{
			Rel:     sqlgraph.M2O,
			Inverse: true,
			Table:   privatekey.UserTable,
			Columns: []string{privatekey.UserColumn},
			Bidi:    false,
			Target: &sqlgraph.EdgeTarget{
				IDSpec: &sqlgraph.FieldSpec{
					Type:   field.TypeString,
					Column: user.FieldID,
				},
			},
		}
		_spec.Edges.Clear = append(_spec.Edges.Clear, edge)
	}
	if nodes := pku.mutation.UserIDs(); len(nodes) > 0 {
		edge := &sqlgraph.EdgeSpec{
			Rel:     sqlgraph.M2O,
			Inverse: true,
			Table:   privatekey.UserTable,
			Columns: []string{privatekey.UserColumn},
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
		_spec.Edges.Add = append(_spec.Edges.Add, edge)
	}
	if n, err = sqlgraph.UpdateNodes(ctx, pku.driver, _spec); err != nil {
		if _, ok := err.(*sqlgraph.NotFoundError); ok {
			err = &NotFoundError{privatekey.Label}
		} else if sqlgraph.IsConstraintError(err) {
			err = &ConstraintError{msg: err.Error(), wrap: err}
		}
		return 0, err
	}
	return n, nil
}

// PrivateKeyUpdateOne is the builder for updating a single PrivateKey entity.
type PrivateKeyUpdateOne struct {
	config
	fields   []string
	hooks    []Hook
	mutation *PrivateKeyMutation
}

// SetKty sets the "kty" field.
func (pkuo *PrivateKeyUpdateOne) SetKty(s string) *PrivateKeyUpdateOne {
	pkuo.mutation.SetKty(s)
	return pkuo
}

// SetAlg sets the "alg" field.
func (pkuo *PrivateKeyUpdateOne) SetAlg(s string) *PrivateKeyUpdateOne {
	pkuo.mutation.SetAlg(s)
	return pkuo
}

// SetNillableAlg sets the "alg" field if the given value is not nil.
func (pkuo *PrivateKeyUpdateOne) SetNillableAlg(s *string) *PrivateKeyUpdateOne {
	if s != nil {
		pkuo.SetAlg(*s)
	}
	return pkuo
}

// ClearAlg clears the value of the "alg" field.
func (pkuo *PrivateKeyUpdateOne) ClearAlg() *PrivateKeyUpdateOne {
	pkuo.mutation.ClearAlg()
	return pkuo
}

// SetJwk sets the "jwk" field.
func (pkuo *PrivateKeyUpdateOne) SetJwk(u []uint8) *PrivateKeyUpdateOne {
	pkuo.mutation.SetJwk(u)
	return pkuo
}

// SetUpdatedAt sets the "updated_at" field.
func (pkuo *PrivateKeyUpdateOne) SetUpdatedAt(t time.Time) *PrivateKeyUpdateOne {
	pkuo.mutation.SetUpdatedAt(t)
	return pkuo
}

// SetNillableUpdatedAt sets the "updated_at" field if the given value is not nil.
func (pkuo *PrivateKeyUpdateOne) SetNillableUpdatedAt(t *time.Time) *PrivateKeyUpdateOne {
	if t != nil {
		pkuo.SetUpdatedAt(*t)
	}
	return pkuo
}

// SetUserID sets the "user" edge to the User entity by ID.
func (pkuo *PrivateKeyUpdateOne) SetUserID(id string) *PrivateKeyUpdateOne {
	pkuo.mutation.SetUserID(id)
	return pkuo
}

// SetNillableUserID sets the "user" edge to the User entity by ID if the given value is not nil.
func (pkuo *PrivateKeyUpdateOne) SetNillableUserID(id *string) *PrivateKeyUpdateOne {
	if id != nil {
		pkuo = pkuo.SetUserID(*id)
	}
	return pkuo
}

// SetUser sets the "user" edge to the User entity.
func (pkuo *PrivateKeyUpdateOne) SetUser(u *User) *PrivateKeyUpdateOne {
	return pkuo.SetUserID(u.ID)
}

// Mutation returns the PrivateKeyMutation object of the builder.
func (pkuo *PrivateKeyUpdateOne) Mutation() *PrivateKeyMutation {
	return pkuo.mutation
}

// ClearUser clears the "user" edge to the User entity.
func (pkuo *PrivateKeyUpdateOne) ClearUser() *PrivateKeyUpdateOne {
	pkuo.mutation.ClearUser()
	return pkuo
}

// Select allows selecting one or more fields (columns) of the returned entity.
// The default is selecting all fields defined in the entity schema.
func (pkuo *PrivateKeyUpdateOne) Select(field string, fields ...string) *PrivateKeyUpdateOne {
	pkuo.fields = append([]string{field}, fields...)
	return pkuo
}

// Save executes the query and returns the updated PrivateKey entity.
func (pkuo *PrivateKeyUpdateOne) Save(ctx context.Context) (*PrivateKey, error) {
	var (
		err  error
		node *PrivateKey
	)
	if len(pkuo.hooks) == 0 {
		node, err = pkuo.sqlSave(ctx)
	} else {
		var mut Mutator = MutateFunc(func(ctx context.Context, m Mutation) (Value, error) {
			mutation, ok := m.(*PrivateKeyMutation)
			if !ok {
				return nil, fmt.Errorf("unexpected mutation type %T", m)
			}
			pkuo.mutation = mutation
			node, err = pkuo.sqlSave(ctx)
			mutation.done = true
			return node, err
		})
		for i := len(pkuo.hooks) - 1; i >= 0; i-- {
			if pkuo.hooks[i] == nil {
				return nil, fmt.Errorf("ent: uninitialized hook (forgotten import ent/runtime?)")
			}
			mut = pkuo.hooks[i](mut)
		}
		v, err := mut.Mutate(ctx, pkuo.mutation)
		if err != nil {
			return nil, err
		}
		nv, ok := v.(*PrivateKey)
		if !ok {
			return nil, fmt.Errorf("unexpected node type %T returned from PrivateKeyMutation", v)
		}
		node = nv
	}
	return node, err
}

// SaveX is like Save, but panics if an error occurs.
func (pkuo *PrivateKeyUpdateOne) SaveX(ctx context.Context) *PrivateKey {
	node, err := pkuo.Save(ctx)
	if err != nil {
		panic(err)
	}
	return node
}

// Exec executes the query on the entity.
func (pkuo *PrivateKeyUpdateOne) Exec(ctx context.Context) error {
	_, err := pkuo.Save(ctx)
	return err
}

// ExecX is like Exec, but panics if an error occurs.
func (pkuo *PrivateKeyUpdateOne) ExecX(ctx context.Context) {
	if err := pkuo.Exec(ctx); err != nil {
		panic(err)
	}
}

func (pkuo *PrivateKeyUpdateOne) sqlSave(ctx context.Context) (_node *PrivateKey, err error) {
	_spec := &sqlgraph.UpdateSpec{
		Node: &sqlgraph.NodeSpec{
			Table:   privatekey.Table,
			Columns: privatekey.Columns,
			ID: &sqlgraph.FieldSpec{
				Type:   field.TypeString,
				Column: privatekey.FieldID,
			},
		},
	}
	id, ok := pkuo.mutation.ID()
	if !ok {
		return nil, &ValidationError{Name: "id", err: errors.New(`ent: missing "PrivateKey.id" for update`)}
	}
	_spec.Node.ID.Value = id
	if fields := pkuo.fields; len(fields) > 0 {
		_spec.Node.Columns = make([]string, 0, len(fields))
		_spec.Node.Columns = append(_spec.Node.Columns, privatekey.FieldID)
		for _, f := range fields {
			if !privatekey.ValidColumn(f) {
				return nil, &ValidationError{Name: f, err: fmt.Errorf("ent: invalid field %q for query", f)}
			}
			if f != privatekey.FieldID {
				_spec.Node.Columns = append(_spec.Node.Columns, f)
			}
		}
	}
	if ps := pkuo.mutation.predicates; len(ps) > 0 {
		_spec.Predicate = func(selector *sql.Selector) {
			for i := range ps {
				ps[i](selector)
			}
		}
	}
	if value, ok := pkuo.mutation.Kty(); ok {
		_spec.Fields.Set = append(_spec.Fields.Set, &sqlgraph.FieldSpec{
			Type:   field.TypeString,
			Value:  value,
			Column: privatekey.FieldKty,
		})
	}
	if value, ok := pkuo.mutation.Alg(); ok {
		_spec.Fields.Set = append(_spec.Fields.Set, &sqlgraph.FieldSpec{
			Type:   field.TypeString,
			Value:  value,
			Column: privatekey.FieldAlg,
		})
	}
	if pkuo.mutation.AlgCleared() {
		_spec.Fields.Clear = append(_spec.Fields.Clear, &sqlgraph.FieldSpec{
			Type:   field.TypeString,
			Column: privatekey.FieldAlg,
		})
	}
	if value, ok := pkuo.mutation.Jwk(); ok {
		_spec.Fields.Set = append(_spec.Fields.Set, &sqlgraph.FieldSpec{
			Type:   field.TypeJSON,
			Value:  value,
			Column: privatekey.FieldJwk,
		})
	}
	if value, ok := pkuo.mutation.UpdatedAt(); ok {
		_spec.Fields.Set = append(_spec.Fields.Set, &sqlgraph.FieldSpec{
			Type:   field.TypeTime,
			Value:  value,
			Column: privatekey.FieldUpdatedAt,
		})
	}
	if pkuo.mutation.UserCleared() {
		edge := &sqlgraph.EdgeSpec{
			Rel:     sqlgraph.M2O,
			Inverse: true,
			Table:   privatekey.UserTable,
			Columns: []string{privatekey.UserColumn},
			Bidi:    false,
			Target: &sqlgraph.EdgeTarget{
				IDSpec: &sqlgraph.FieldSpec{
					Type:   field.TypeString,
					Column: user.FieldID,
				},
			},
		}
		_spec.Edges.Clear = append(_spec.Edges.Clear, edge)
	}
	if nodes := pkuo.mutation.UserIDs(); len(nodes) > 0 {
		edge := &sqlgraph.EdgeSpec{
			Rel:     sqlgraph.M2O,
			Inverse: true,
			Table:   privatekey.UserTable,
			Columns: []string{privatekey.UserColumn},
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
		_spec.Edges.Add = append(_spec.Edges.Add, edge)
	}
	_node = &PrivateKey{config: pkuo.config}
	_spec.Assign = _node.assignValues
	_spec.ScanValues = _node.scanValues
	if err = sqlgraph.UpdateNode(ctx, pkuo.driver, _spec); err != nil {
		if _, ok := err.(*sqlgraph.NotFoundError); ok {
			err = &NotFoundError{privatekey.Label}
		} else if sqlgraph.IsConstraintError(err) {
			err = &ConstraintError{msg: err.Error(), wrap: err}
		}
		return nil, err
	}
	return _node, nil
}
