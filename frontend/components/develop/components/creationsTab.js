import React, {useEffect, useReducer, useState} from "react";
import VerticalSelector from "../../verticalSelector";
import { developerPages } from "../constants";
import GamesSubPage from "./subPages/games";
import {getPermissionsForRoleset, getRoles, getUserGroups} from "../../../services/groups";
import authentication from "../../../stores/authentication";

const CreationsTab = props => {
  const selected = developerPages.find(v => v.id === props.id) || developerPages[0];
  if (!selected)
    return null;

  return <div className='row'>
    <div className='col-12 col-md-3 col-lg-2'>
      {
        props.groups && props.groups.length > 0 ? <div>
          <p className='mb-0 mt-2'>Select Group:</p>
          <select className='w-100' value={props.groupId || props.groups[0].id} onChange={newValue => {
            props.setGroupId(parseInt(newValue.currentTarget.value, 10));
          }}>
            {
              props.groups.map(v => {
                return <option key={v.id} value={v.id}>{v.name}</option>
              })
            }
          </select>
        </div> : null
      }
      <VerticalSelector selected={selected.name} options={developerPages.map(v => {
        return {
          name: v.name,
          url: v.url,
          disabled: v.disabled
        }
      })} />
    </div>
    <div className='col-12 col-md-9 col-lg-10 mt-3 mt-md-4'>
      {selected?.element && selected.element({
        isGroupTab: props.isGroupTab,
        groupId: props.groupId,
      })}
    </div>
  </div>
}

export default CreationsTab;
