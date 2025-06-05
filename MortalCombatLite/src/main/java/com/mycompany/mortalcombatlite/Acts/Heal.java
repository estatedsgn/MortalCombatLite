/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.mycompany.mortalcombatlite.Acts;

import com.mycompany.mortalcombatlite.Heros.Hero;

/**
 *
 * @author nyaku
 */
public class Heal extends Act {

    @Override
    public String getType() {
        return "Heal";
    }

    @Override
    public void realisation(Hero hero1, Hero hero2, String hero2ActionType) {
        switch (hero2ActionType) {
            case "Hit" -> {
            }
            case "Block" -> {
                hero1.setHealth((hero1.getMaxHealth() - hero1.getHealth()) / 2 + hero1.getHealth());
            }
            case "Debuff" -> {
            }
            case "Heal" -> {
            }
        }
    }
}
