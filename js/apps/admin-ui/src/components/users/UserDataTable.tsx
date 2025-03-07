import type ComponentRepresentation from "@keycloak/keycloak-admin-client/lib/defs/componentRepresentation";
import type RealmRepresentation from "@keycloak/keycloak-admin-client/lib/defs/realmRepresentation";
import type UserProfileConfig from "@keycloak/keycloak-admin-client/lib/defs/userProfileConfig";
import type UserRepresentation from "@keycloak/keycloak-admin-client/lib/defs/userRepresentation";
import {
  AlertVariant,
  Button,
  ButtonVariant,
  Chip,
  ChipGroup,
  EmptyState,
  FlexItem,
  Label,
  Text,
  TextContent,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Tooltip,
} from "@patternfly/react-core";
import {
  ExclamationCircleIcon,
  InfoCircleIcon,
  WarningTriangleIcon,
} from "@patternfly/react-icons";
import type { IRowData } from "@patternfly/react-table";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { adminClient } from "../../admin-client";
import { useAlerts } from "../alert/Alerts";
import { useConfirmDialog } from "../confirm-dialog/ConfirmDialog";
import { KeycloakSpinner } from "../keycloak-spinner/KeycloakSpinner";
import { ListEmptyState } from "../list-empty-state/ListEmptyState";
import { BruteUser, findUsers } from "../role-mapping/resource";
import { KeycloakDataTable } from "../table-toolbar/KeycloakDataTable";
import { useRealm } from "../../context/realm-context/RealmContext";
import { emptyFormatter } from "../../util";
import { useFetch } from "../../utils/useFetch";
import { toAddUser } from "../../user/routes/AddUser";
import { toUser } from "../../user/routes/User";
import { UserDataTableToolbarItems } from "./UserDataTableToolbarItems";
import { SearchType } from "../../user/details/SearchFilter";

export type UserAttribute = {
  name: string;
  displayName: string;
  value: string;
};

export function UserDataTable() {
  const { t } = useTranslation();
  const { addAlert, addError } = useAlerts();
  const { realm: realmName } = useRealm();
  const navigate = useNavigate();
  const [userStorage, setUserStorage] = useState<ComponentRepresentation[]>();
  const [searchUser, setSearchUser] = useState("");
  const [realm, setRealm] = useState<RealmRepresentation | undefined>();
  const [selectedRows, setSelectedRows] = useState<UserRepresentation[]>([]);
  const [searchType, setSearchType] = useState<SearchType>("default");
  const [activeFilters, setActiveFilters] = useState<UserAttribute[]>([]);
  const [profile, setProfile] = useState<UserProfileConfig>({});
  const [query, setQuery] = useState("");

  const [key, setKey] = useState(0);
  const refresh = () => setKey(key + 1);

  useFetch(
    async () => {
      const testParams = {
        type: "org.keycloak.storage.UserStorageProvider",
      };

      try {
        return await Promise.all([
          adminClient.components.find(testParams),
          adminClient.realms.findOne({ realm: realmName }),
          adminClient.users.getProfile(),
        ]);
      } catch {
        return [[], {}, {}] as [
          ComponentRepresentation[],
          RealmRepresentation | undefined,
          UserProfileConfig,
        ];
      }
    },
    ([storageProviders, realm, profile]) => {
      setUserStorage(
        storageProviders.filter((p) => p.config?.enabled[0] === "true"),
      );
      setRealm(realm);
      setProfile(profile);
    },
    [],
  );

  const UserDetailLink = (user: UserRepresentation) => (
    <Link
      key={user.username}
      to={toUser({ realm: realmName, id: user.id!, tab: "settings" })}
    >
      {user.username}
    </Link>
  );

  const loader = async (first?: number, max?: number, search?: string) => {
    const params: { [name: string]: string | number } = {
      first: first!,
      max: max!,
      q: query!,
    };

    const searchParam = search || searchUser || "";
    if (searchParam) {
      params.search = searchParam;
    }

    if (!listUsers && !searchParam) {
      return [];
    }

    try {
      return await findUsers({
        briefRepresentation: true,
        ...params,
      });
    } catch (error) {
      if (userStorage?.length) {
        addError("users:noUsersFoundErrorStorage", error);
      } else {
        addError("users:noUsersFoundError", error);
      }
      return [];
    }
  };

  const [toggleUnlockUsersDialog, UnlockUsersConfirm] = useConfirmDialog({
    titleKey: "users:unlockAllUsers",
    messageKey: "users:unlockUsersConfirm",
    continueButtonLabel: "users:unlock",
    onConfirm: async () => {
      try {
        await adminClient.attackDetection.delAll();
        refresh();
        addAlert(t("unlockUsersSuccess"), AlertVariant.success);
      } catch (error) {
        addError("users:unlockUsersError", error);
      }
    },
  });

  const [toggleDeleteDialog, DeleteConfirm] = useConfirmDialog({
    titleKey: "deleteConfirmUsers",
    messageKey: t("deleteConfirmDialog", { count: selectedRows.length }),
    continueButtonLabel: "delete",
    continueButtonVariant: ButtonVariant.danger,
    onConfirm: async () => {
      try {
        for (const user of selectedRows) {
          await adminClient.users.del({ id: user.id! });
        }
        setSelectedRows([]);
        clearAllFilters();
        addAlert(t("userDeletedSuccess"), AlertVariant.success);
      } catch (error) {
        addError("users:userDeletedError", error);
      }
    },
  });

  const StatusRow = (user: BruteUser) => {
    return (
      <>
        {!user.enabled && (
          <Label key={user.id} color="red" icon={<InfoCircleIcon />}>
            {t("disabled")}
          </Label>
        )}
        {user.bruteForceStatus?.disabled && (
          <Label key={user.id} color="orange" icon={<WarningTriangleIcon />}>
            {t("temporaryLocked")}
          </Label>
        )}
        {user.enabled && !user.bruteForceStatus?.disabled && "—"}
      </>
    );
  };

  const ValidatedEmail = (user: UserRepresentation) => {
    return (
      <>
        {!user.emailVerified && (
          <Tooltip
            key={`email-verified-${user.id}`}
            content={<>{t("notVerified")}</>}
          >
            <ExclamationCircleIcon className="keycloak__user-section__email-verified" />
          </Tooltip>
        )}{" "}
        {emptyFormatter()(user.email)}
      </>
    );
  };

  const goToCreate = () => navigate(toAddUser({ realm: realmName }));

  if (!userStorage || !realm) {
    return <KeycloakSpinner />;
  }

  //should *only* list users when no user federation is configured
  const listUsers = !(userStorage.length > 0);

  const clearAllFilters = () => {
    const filtered = [...activeFilters].filter(
      (chip) => chip.name !== chip.name,
    );
    setActiveFilters(filtered);
    setSearchUser("");
    setQuery("");
    refresh();
  };

  const createQueryString = (filters: UserAttribute[]) => {
    return filters.map((filter) => `${filter.name}:${filter.value}`).join(" ");
  };

  const searchUserWithAttributes = () => {
    const attributes = createQueryString(activeFilters);
    setQuery(attributes);
    refresh();
  };

  const createAttributeSearchChips = () => {
    return (
      <FlexItem>
        {activeFilters.length > 0 && (
          <>
            {Object.values(activeFilters).map((entry) => {
              return (
                <ChipGroup
                  className="pf-u-mt-md pf-u-mr-md"
                  key={entry.name}
                  categoryName={
                    entry.displayName.length ? entry.displayName : entry.name
                  }
                  isClosable
                  onClick={(event) => {
                    event.stopPropagation();

                    const filtered = [...activeFilters].filter(
                      (chip) => chip.name !== entry.name,
                    );
                    const attributes = createQueryString(filtered);

                    setActiveFilters(filtered);
                    setQuery(attributes);
                    refresh();
                  }}
                >
                  <Chip key={entry.name} isReadOnly>
                    {entry.value}
                  </Chip>
                </ChipGroup>
              );
            })}
          </>
        )}
      </FlexItem>
    );
  };

  const toolbar = () => {
    return (
      <UserDataTableToolbarItems
        realm={realm}
        hasSelectedRows={selectedRows.length === 0}
        toggleDeleteDialog={toggleDeleteDialog}
        toggleUnlockUsersDialog={toggleUnlockUsersDialog}
        goToCreate={goToCreate}
        searchType={searchType}
        setSearchType={setSearchType}
        searchUser={searchUser}
        setSearchUser={setSearchUser}
        activeFilters={activeFilters}
        setActiveFilters={setActiveFilters}
        refresh={refresh}
        profile={profile}
        clearAllFilters={clearAllFilters}
        createAttributeSearchChips={createAttributeSearchChips}
        searchUserWithAttributes={searchUserWithAttributes}
      />
    );
  };

  const subtoolbar = () => {
    if (!activeFilters.length) {
      return;
    }
    return (
      <div className="user-attribute-search-form-subtoolbar">
        <ToolbarItem>{createAttributeSearchChips()}</ToolbarItem>
        <ToolbarItem>
          <Button
            variant="link"
            onClick={() => {
              clearAllFilters();
            }}
          >
            {t("clearAllFilters")}
          </Button>
        </ToolbarItem>
      </div>
    );
  };

  return (
    <>
      <DeleteConfirm />
      <UnlockUsersConfirm />
      <KeycloakDataTable
        isSearching
        key={key}
        loader={loader}
        isPaginated
        ariaLabelKey="titleUsers"
        canSelectAll
        onSelect={(rows: UserRepresentation[]) => setSelectedRows([...rows])}
        emptyState={
          !listUsers ? (
            <>
              <Toolbar>
                <ToolbarContent>{toolbar()}</ToolbarContent>
              </Toolbar>
              <EmptyState data-testid="empty-state" variant="large">
                <TextContent className="kc-search-users-text">
                  <Text>{t("searchForUserDescription")}</Text>
                </TextContent>
              </EmptyState>
            </>
          ) : (
            <ListEmptyState
              message={t("noUsersFound")}
              instructions={t("emptyInstructions")}
              primaryActionText={t("createNewUser")}
              onPrimaryAction={goToCreate}
            />
          )
        }
        toolbarItem={toolbar()}
        subToolbar={subtoolbar()}
        actionResolver={(rowData: IRowData) => {
          const user: UserRepresentation = rowData.data;
          if (!user.access?.manage) return [];

          return [
            {
              title: t("delete"),
              onClick: () => {
                setSelectedRows([user]);
                toggleDeleteDialog();
              },
            },
          ];
        }}
        columns={[
          {
            name: "username",
            displayKey: "users:username",
            cellRenderer: UserDetailLink,
          },
          {
            name: "email",
            displayKey: "users:email",
            cellRenderer: ValidatedEmail,
          },
          {
            name: "lastName",
            displayKey: "users:lastName",
            cellFormatters: [emptyFormatter()],
          },
          {
            name: "firstName",
            displayKey: "users:firstName",
            cellFormatters: [emptyFormatter()],
          },
          {
            name: "status",
            displayKey: "users:status",
            cellRenderer: StatusRow,
          },
        ]}
      />
    </>
  );
}
